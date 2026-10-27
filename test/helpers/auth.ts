import type { PrismaClient, User } from '@prisma/client';
import type { AuthConfig } from '../../src/config.js';
import { createSession, upsertUserByGoogle } from '../../src/db/user-repo.js';

/** Config de auth pra buildApp nos testes de rota (habilita cookie + rotas de dados). */
export const testAuth: AuthConfig = {
  googleClientId: 'client-123',
  googleClientSecret: 'secret',
  redirectUri: 'http://localhost:3000/auth/callback',
  cookieSecret: 'test-cookie-secret',
  postLoginRedirect: '/',
  secureCookies: false,
};

let seq = 0;

/**
 * Cria (ou reusa, pelo sub) um usuário de teste. Email único por chamada se omitido. Por
 * padrão já com double opt-in confirmado (`confirmed`), já que a maioria dos testes assume
 * que o usuário recebe alertas; passe `false` pra exercitar o gate de confirmação.
 */
export async function makeUser(
  prisma: PrismaClient,
  email?: string,
  confirmed = true,
): Promise<User> {
  const e = email ?? `tester${++seq}@utiva.test`;
  const user = await upsertUserByGoogle(prisma, {
    sub: `sub-${e}`,
    email: e,
    emailVerified: true,
    name: 'Tester',
  });
  if (!confirmed) return user;
  return prisma.user.update({ where: { id: user.id }, data: { emailOptInAt: new Date() } });
}

/** Cria uma sessão e devolve o cookie pronto pra app.inject({ cookies }). */
export async function loginCookies(
  prisma: PrismaClient,
  userId: string,
): Promise<Record<string, string>> {
  const { token } = await createSession(prisma, userId);
  return { utiva_session: token };
}
