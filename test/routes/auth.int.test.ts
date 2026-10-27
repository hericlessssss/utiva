import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AuthConfig } from '../../src/config.js';
import type { FetchLike } from '../../src/auth/google.js';

const auth: AuthConfig = {
  googleClientId: 'client-123',
  googleClientSecret: 'secret',
  redirectUri: 'http://localhost:3000/auth/callback',
  cookieSecret: 'test-cookie-secret',
  postLoginRedirect: '/',
  secureCookies: false,
};

/** id_token falso com os claims que o nosso validador espera. */
function fakeIdToken(overrides: Record<string, unknown> = {}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const claims = {
    iss: 'https://accounts.google.com',
    aud: auth.googleClientId,
    sub: 'google-sub-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'jogador@gmail.com',
    email_verified: true,
    name: 'Jogador',
    picture: 'https://foto',
    ...overrides,
  };
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}

/** fetch falso que devolve sempre o mesmo id_token (não bate no Google). */
const okFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ id_token: fakeIdToken(), access_token: 'at' }),
});

/** Como `okFetch`, mas com o e-mail NÃO verificado pelo Google. */
const unverifiedFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ id_token: fakeIdToken({ email_verified: false }) }),
});

/** fetch falso que simula o Google recusando a troca do código. */
const failFetch: FetchLike = async () => ({ ok: false, status: 400, text: async () => 'invalid_grant' });

const prisma = new PrismaClient();
const app: FastifyInstance = buildApp({ prisma, auth, authFetch: okFetch });
// Mesmo cookieSecret/DB → o cookie de estado emitido por `app` vale nestes aqui.
const appUnverified: FastifyInstance = buildApp({ prisma, auth, authFetch: unverifiedFetch });
const appFail: FastifyInstance = buildApp({ prisma, auth, authFetch: failFetch });

/** Dispara /auth/google e colhe o state (da URL do Google) + o cookie oauth assinado. */
async function startLogin(): Promise<{ state: string; oauthCookie: string }> {
  const res = await app.inject({ method: 'GET', url: '/auth/google' });
  expect(res.statusCode).toBe(302);
  const state = new URL(res.headers.location as string).searchParams.get('state')!;
  const oauthCookie = res.cookies.find((c) => c.name === 'utiva_oauth')!.value;
  return { state, oauthCookie };
}

describe('rotas /auth (integração)', () => {
  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  beforeAll(async () => {
    await appUnverified.ready();
    await appFail.ready();
  });

  afterAll(async () => {
    await app.close();
    await appUnverified.close();
    await appFail.close();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('GET /auth/google redireciona ao Google e seta o cookie de estado', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/google' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.location).toContain('code_challenge=');
    expect(res.cookies.some((c) => c.name === 'utiva_oauth')).toBe(true);
  });

  it('fluxo feliz: callback cria usuário + sessão, /auth/me responde, logout encerra', async () => {
    const { state, oauthCookie } = await startLogin();

    const cb = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=abc&state=${state}`,
      cookies: { utiva_oauth: oauthCookie },
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/');
    const session = cb.cookies.find((c) => c.name === 'utiva_session')!;
    expect(session.value).toBeTruthy();
    expect(await prisma.user.count()).toBe(1);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { utiva_session: session.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: 'jogador@gmail.com', name: 'Jogador' });

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { utiva_session: session.value },
    });
    expect(logout.statusCode).toBe(204);
    expect(await prisma.session.count()).toBe(0);

    const meAfter = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { utiva_session: session.value },
    });
    expect(meAfter.statusCode).toBe(401);
  });

  it('callback com state divergente dá 400 (CSRF)', async () => {
    const { oauthCookie } = await startLogin();
    const cb = await app.inject({
      method: 'GET',
      url: '/auth/callback?code=abc&state=ERRADO',
      cookies: { utiva_oauth: oauthCookie },
    });
    expect(cb.statusCode).toBe(400);
  });

  it('callback sem cookie de estado volta pra home (navegação top-level, não JSON de erro)', async () => {
    const cb = await app.inject({ method: 'GET', url: '/auth/callback?code=abc&state=qualquer' });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/');
  });

  it('recusa login com e-mail não verificado no Google (sem criar usuário/sessão)', async () => {
    const { state, oauthCookie } = await startLogin();
    const cb = await appUnverified.inject({
      method: 'GET',
      url: `/auth/callback?code=abc&state=${state}`,
      cookies: { utiva_oauth: oauthCookie },
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/');
    expect(cb.cookies.some((c) => c.name === 'utiva_session')).toBe(false);
    expect(await prisma.user.count()).toBe(0);
  });

  it('callback com error do Google volta pra home sem sessão', async () => {
    const { oauthCookie } = await startLogin();
    const cb = await app.inject({
      method: 'GET',
      url: '/auth/callback?error=access_denied',
      cookies: { utiva_oauth: oauthCookie },
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/');
    expect(cb.cookies.some((c) => c.name === 'utiva_session')).toBe(false);
  });

  it('falha na troca do código volta pra home (não despeja JSON na navegação)', async () => {
    const { state, oauthCookie } = await startLogin();
    const cb = await appFail.inject({
      method: 'GET',
      url: `/auth/callback?code=abc&state=${state}`,
      cookies: { utiva_oauth: oauthCookie },
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/');
    expect(cb.cookies.some((c) => c.name === 'utiva_session')).toBe(false);
  });

  it('/auth/me sem cookie dá 401', async () => {
    const me = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(me.statusCode).toBe(401);
  });
});
