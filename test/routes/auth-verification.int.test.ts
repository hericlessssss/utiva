import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FetchLike } from '../../src/auth/google.js';
import { issueEmailVerification } from '../../src/db/email-repo.js';
import { ensureVerificationQueue, VERIFICATION_QUEUE } from '../../src/queue/verification-queue.js';
import { loginCookies, makeUser, testAuth } from '../helpers/auth.js';

/** id_token falso com os claims que o validador espera. */
function fakeIdToken(overrides: Record<string, unknown> = {}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const claims = {
    iss: 'https://accounts.google.com',
    aud: testAuth.googleClientId,
    sub: 'sub-verif-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'login@x',
    email_verified: true,
    name: 'Login',
    ...overrides,
  };
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}
const okFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ id_token: fakeIdToken(), access_token: 'at' }),
});

const prisma = new PrismaClient();
const boss = new PgBoss(process.env.DATABASE_URL!);
const app: FastifyInstance = buildApp({ prisma, auth: testAuth, boss, authFetch: okFetch });

async function startLogin(): Promise<{ state: string; oauthCookie: string }> {
  const res = await app.inject({ method: 'GET', url: '/auth/google' });
  const state = new URL(res.headers.location as string).searchParams.get('state')!;
  const oauthCookie = res.cookies.find((c) => c.name === 'utiva_oauth')!.value;
  return { state, oauthCookie };
}

describe('rotas de confirmação de e-mail (integração)', () => {
  beforeAll(async () => {
    await boss.start();
    await ensureVerificationQueue(boss);
    await boss.purgeQueue(VERIFICATION_QUEUE);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await boss.stop();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('login dispara a confirmação (token criado, opt-in pendente, /auth/me emailVerified=false)', async () => {
    const { state, oauthCookie } = await startLogin();
    const cb = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=abc&state=${state}`,
      cookies: { utiva_oauth: oauthCookie },
    });
    const session = cb.cookies.find((c) => c.name === 'utiva_session')!.value;

    const user = await prisma.user.findFirstOrThrow();
    expect(user.emailOptInAt).toBeNull();
    expect(await prisma.emailVerification.count({ where: { userId: user.id } })).toBe(1);

    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { utiva_session: session } });
    expect(me.json()).toMatchObject({ emailVerified: false });
  });

  it('verify-email com token válido confirma e redireciona com ?email=confirmed', async () => {
    const user = await makeUser(prisma, 'confirmar@x', false);
    const { token } = await issueEmailVerification(prisma, user.id, user.email);

    const res = await app.inject({ method: 'GET', url: `/auth/verify-email?token=${token}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?email=confirmed');

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.emailOptInAt).not.toBeNull();
  });

  it('verify-email com token inválido redireciona com ?email=invalid', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/verify-email?token=nao-existe' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?email=invalid');
  });

  it('resend-verification sem login dá 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/resend-verification' });
    expect(res.statusCode).toBe(401);
  });

  it('resend-verification: 202 no 1º envio, 429 dentro do cooldown', async () => {
    const user = await makeUser(prisma, 'reenvio@x', false);
    const cookies = await loginCookies(prisma, user.id);

    const first = await app.inject({ method: 'POST', url: '/auth/resend-verification', cookies });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ status: 'sent' });

    const again = await app.inject({ method: 'POST', url: '/auth/resend-verification', cookies });
    expect(again.statusCode).toBe(429);
  });

  it('resend-verification de usuário já confirmado dá 200 confirmed', async () => {
    const user = await makeUser(prisma, 'jaok@x'); // confirmado
    const cookies = await loginCookies(prisma, user.id);

    const res = await app.inject({ method: 'POST', url: '/auth/resend-verification', cookies });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'confirmed' });
  });
});
