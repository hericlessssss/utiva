import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthConfig } from '../config.js';
import { exchangeCode, type FetchLike } from '../auth/google.js';
import {
  buildGoogleAuthUrl,
  decodeIdToken,
  generatePkce,
  generateState,
  validateIdClaims,
} from '../auth/oidc.js';
import {
  createSession,
  deleteSession,
  findUserBySession,
  SESSION_TTL_MS,
  upsertUserByGoogle,
} from '../db/user-repo.js';

/** Cookie da sessão de login (token opaco). */
export const SESSION_COOKIE = 'utiva_session';
/** Cookie efêmero que carrega {state, verifier} entre /auth/google e /auth/callback. */
const OAUTH_COOKIE = 'utiva_oauth';
/** Janela para completar o login após sair para o Google. */
const OAUTH_TTL_S = 600;

interface OauthState {
  state: string;
  verifier: string;
}

export interface AuthRoutesOpts {
  prisma: PrismaClient;
  auth: AuthConfig;
  /** Injetável nos testes para não bater no Google de verdade. */
  fetchImpl?: FetchLike;
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOpts): Promise<void> {
  const { prisma, auth, fetchImpl } = opts;

  const baseCookie = {
    httpOnly: true,
    sameSite: 'lax' as const, // 'lax' deixa o cookie sobreviver ao redirect de volta do Google (GET top-level)
    secure: auth.secureCookies,
    path: '/',
  };

  const clearOauthCookie = (reply: FastifyReply): void => {
    reply.clearCookie(OAUTH_COOKIE, { ...baseCookie, path: '/auth' });
  };

  // Passo 1: inicia o fluxo — gera PKCE+state, guarda num cookie assinado e redireciona ao Google.
  app.get('/auth/google', async (_req, reply) => {
    const { verifier, challenge } = generatePkce();
    const state = generateState();
    reply.setCookie(OAUTH_COOKIE, JSON.stringify({ state, verifier } satisfies OauthState), {
      ...baseCookie,
      path: '/auth',
      signed: true,
      maxAge: OAUTH_TTL_S,
    });
    const url = buildGoogleAuthUrl({
      clientId: auth.googleClientId,
      redirectUri: auth.redirectUri,
      state,
      codeChallenge: challenge,
    });
    return reply.redirect(url);
  });

  // Passo 2: o Google volta aqui com `code` + `state`. Validamos o state, trocamos o
  // código por tokens, lemos a identidade, criamos a sessão e setamos o cookie de login.
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/callback',
    async (req, reply) => {
      // Usuário cancelou no Google (ou erro de consentimento): volta pra home sem sessão.
      if (req.query.error) {
        clearOauthCookie(reply);
        return reply.redirect(auth.postLoginRedirect);
      }

      const raw = req.cookies[OAUTH_COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : null;
      clearOauthCookie(reply);

      // Cookie de estado ausente/expirado/adulterado: quase sempre benigno (passou de
      // OAUTH_TTL_S no consentimento, ou o browser dropou o cookie). Como é uma navegação
      // top-level, volta pra app em vez de despejar um JSON de erro na tela do usuário.
      let saved: OauthState | null = null;
      if (unsigned?.valid && unsigned.value) {
        try {
          saved = JSON.parse(unsigned.value) as OauthState;
        } catch {
          saved = null;
        }
      }
      if (!saved) return reply.redirect(auth.postLoginRedirect);

      const { code, state } = req.query;
      if (!code || !state || state !== saved.state) {
        // state presente mas divergente = anomalia real (possível CSRF/adulteração): não é o
        // fluxo normal, então sinaliza com 400 em vez de mascarar com um redirect silencioso.
        return reply.code(400).send({ error: 'state não confere (possível CSRF)' });
      }

      try {
        const tokens = await exchangeCode(
          {
            code,
            verifier: saved.verifier,
            clientId: auth.googleClientId,
            clientSecret: auth.googleClientSecret,
            redirectUri: auth.redirectUri,
          },
          fetchImpl,
        );
        const identity = validateIdClaims(decodeIdToken(tokens.id_token), {
          clientId: auth.googleClientId,
        });
        // Cadastro aberto + alertas por e-mail: só loga com e-mail verificado pelo Google,
        // senão mandaríamos alertas a um endereço que o usuário pode não controlar.
        if (!identity.emailVerified) {
          req.log.warn({ sub: identity.sub }, 'login recusado: e-mail não verificado no Google');
          return reply.redirect(auth.postLoginRedirect);
        }
        const user = await upsertUserByGoogle(prisma, identity);
        const { token } = await createSession(prisma, user.id);
        reply.setCookie(SESSION_COOKIE, token, { ...baseCookie, maxAge: SESSION_TTL_MS / 1000 });
        return reply.redirect(auth.postLoginRedirect);
      } catch (err) {
        // Falha transitória (código expirado, callback reaberto, erro no token endpoint): é uma
        // navegação top-level, então volta pra app em vez de despejar um JSON de erro na tela.
        req.log.warn({ err }, 'falha no callback de login do Google');
        return reply.redirect(auth.postLoginRedirect);
      }
    },
  );

  // Encerra a sessão: apaga do banco e limpa o cookie. Idempotente.
  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(prisma, token);
    reply.clearCookie(SESSION_COOKIE, baseCookie);
    return reply.code(204).send();
  });

  // Identidade da sessão atual (o frontend usa pra saber se está logado).
  app.get('/auth/me', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? await findUserBySession(prisma, token) : null;
    if (!user) return reply.code(401).send({ error: 'não autenticado' });
    return { id: user.id, email: user.email, name: user.name, picture: user.picture };
  });
}
