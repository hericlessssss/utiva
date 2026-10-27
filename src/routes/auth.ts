import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type PgBoss from 'pg-boss';
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
import { confirmEmailByToken } from '../db/email-repo.js';
import { requestVerification } from '../queue/verification-queue.js';

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
  /** Fila pg-boss do e-mail de confirmação (double opt-in). Ausente = não envia confirmação. */
  boss?: PgBoss;
  /** Injetável nos testes para não bater no Google de verdade. */
  fetchImpl?: FetchLike;
}

/** Acrescenta `?email=<status>` ao destino do redirect (confirma/invalida o e-mail na UI). */
function withEmailParam(redirect: string, status: 'confirmed' | 'invalid'): string {
  const sep = redirect.includes('?') ? '&' : '?';
  return `${redirect}${sep}email=${status}`;
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOpts): Promise<void> {
  const { prisma, auth, boss, fetchImpl } = opts;

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
        // Double opt-in (Fase 4): se o e-mail ainda não foi confirmado, dispara a confirmação
        // (o cooldown evita spam em logins repetidos). Não trava o login se a fila falhar.
        if (boss) {
          await requestVerification(prisma, boss, user).catch((err: unknown) => {
            req.log.warn({ err }, 'falha ao enfileirar e-mail de confirmação');
          });
        }
        return reply.redirect(auth.postLoginRedirect);
      } catch (err) {
        // Falha transitória (código expirado, callback reaberto, erro no token endpoint): é uma
        // navegação top-level, então volta pra app em vez de despejar um JSON de erro na tela.
        req.log.warn({ err }, 'falha no callback de login do Google');
        return reply.redirect(auth.postLoginRedirect);
      }
    },
  );

  // Confirma o e-mail a partir do link (double opt-in). É navegação top-level: redireciona
  // pra app com ?email=confirmed|invalid em vez de devolver JSON.
  app.get<{ Querystring: { token?: string } }>('/auth/verify-email', async (req, reply) => {
    const token = req.query.token;
    const user = token ? await confirmEmailByToken(prisma, token) : null;
    const status = user ? 'confirmed' : 'invalid';
    return reply.redirect(withEmailParam(auth.postLoginRedirect, status));
  });

  // Reenvia o e-mail de confirmação (exige login). Respeita o cooldown de reenvio.
  app.post('/auth/resend-verification', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? await findUserBySession(prisma, token) : null;
    if (!user) return reply.code(401).send({ error: 'não autenticado' });
    if (!boss) return reply.code(503).send({ error: 'confirmação indisponível' });

    try {
      const result = await requestVerification(prisma, boss, user);
      if (result === 'confirmed') return reply.code(200).send({ status: 'confirmed' });
      if (result === 'throttled') return reply.code(429).send({ status: 'throttled' });
      return reply.code(202).send({ status: 'sent' });
    } catch (err) {
      // Falha ao enfileirar a confirmação (fila indisponível). O token foi desfeito, então
      // o usuário pode tentar de novo. Responde 503 em vez de deixar virar 500.
      req.log.warn({ err }, 'falha ao reenviar e-mail de confirmação');
      return reply.code(503).send({ error: 'confirmação indisponível' });
    }
  });

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
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      emailVerified: user.emailOptInAt != null,
    };
  });
}
