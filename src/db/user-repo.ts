import type { PrismaClient, User } from '@prisma/client';
import { generateSessionToken, hashSessionToken, type GoogleIdentity } from '../auth/oidc.js';

/** Duração padrão de uma sessão: 30 dias. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Insere ou atualiza o usuário a partir da identidade do Google. O `google_sub` é a chave
 * estável; e-mail/nome/foto são atualizados a cada login (podem mudar na conta Google). Se o
 * e-mail mudou, reseta o double opt-in (Fase 4): o novo endereço precisa confirmar de novo.
 */
export async function upsertUserByGoogle(prisma: PrismaClient, id: GoogleIdentity): Promise<User> {
  const fields = { email: id.email, name: id.name ?? null, picture: id.picture ?? null };
  const existing = await prisma.user.findUnique({ where: { googleSub: id.sub } });
  const emailChanged = existing != null && existing.email !== id.email;
  return prisma.user.upsert({
    where: { googleSub: id.sub },
    create: { googleSub: id.sub, ...fields },
    update: emailChanged ? { ...fields, emailOptInAt: null } : fields,
  });
}

export interface NewSession {
  /** Token cru — vai no cookie, nunca persistido em claro. */
  token: string;
  expiresAt: Date;
}

/** Cria uma sessão para o usuário e devolve o token cru (o banco guarda só o hash). */
export async function createSession(
  prisma: PrismaClient,
  userId: string,
  ttlMs = SESSION_TTL_MS,
  now = Date.now(),
): Promise<NewSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(now + ttlMs);
  await prisma.session.create({ data: { id: hashSessionToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/**
 * Resolve o usuário dono de um token de sessão, ou `null` se o token não existe ou
 * expirou. Sessão vencida é apagada no caminho (limpeza preguiçosa).
 */
export async function findUserBySession(
  prisma: PrismaClient,
  token: string,
  now = Date.now(),
): Promise<User | null> {
  const id = hashSessionToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

/** Encerra uma sessão (logout). Idempotente — token inexistente não é erro. */
export async function deleteSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session
    .delete({ where: { id: hashSessionToken(token) } })
    .catch(() => undefined);
}
