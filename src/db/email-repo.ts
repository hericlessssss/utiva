import type { PrismaClient, User } from '@prisma/client';
import { randomToken, sha256Hex } from '../auth/oidc.js';

/** Validade de um link de confirmação de e-mail: 24h. */
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssuedVerification {
  /** Token cru — vai no link do e-mail, nunca persistido em claro. */
  token: string;
  expiresAt: Date;
}

/**
 * Emite um token de confirmação para o e-mail atual do usuário (double opt-in). Apaga os
 * tokens anteriores dele (um link vivo por vez) e grava só o hash. Devolve o token cru.
 */
export async function issueEmailVerification(
  prisma: PrismaClient,
  userId: string,
  email: string,
  ttlMs = VERIFICATION_TTL_MS,
  now = Date.now(),
): Promise<IssuedVerification> {
  const token = randomToken();
  const expiresAt = new Date(now + ttlMs);
  await prisma.$transaction([
    prisma.emailVerification.deleteMany({ where: { userId } }),
    prisma.emailVerification.create({ data: { id: sha256Hex(token), userId, email, expiresAt } }),
  ]);
  return { token, expiresAt };
}

/** Último token emitido pro usuário (instante + e-mail que ele confirma), ou null. O e-mail
 * importa pro throttle: se o endereço mudou, o cooldown não deve bloquear um link novo. */
export function latestVerification(
  prisma: PrismaClient,
  userId: string,
): Promise<{ createdAt: Date; email: string } | null> {
  return prisma.emailVerification.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, email: true },
  });
}

/**
 * Confirma o e-mail a partir do token cru do link. Só vale se o token existe, não expirou e
 * o `email` que ele confirma ainda bate com o do usuário (e-mail mudou → token velho não vale).
 * No sucesso seta `email_opt_in_at`, apaga os tokens do usuário e devolve o usuário; senão null.
 */
export async function confirmEmailByToken(
  prisma: PrismaClient,
  token: string,
  now = Date.now(),
): Promise<User | null> {
  const id = sha256Hex(token);
  const record = await prisma.emailVerification.findUnique({ where: { id }, include: { user: true } });
  if (!record) return null;

  const expired = record.expiresAt.getTime() <= now;
  const emailChanged = record.email !== record.user.email;
  if (expired || emailChanged) {
    await prisma.emailVerification.delete({ where: { id } }).catch(() => undefined);
    return null;
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailOptInAt: new Date(now) } }),
    prisma.emailVerification.deleteMany({ where: { userId: record.userId } }),
  ]);
  return user;
}

/** Quantos e-mails de um tipo o usuário recebeu desde `since` (janela do rate-limit). */
export function countEmailEventsSince(
  prisma: PrismaClient,
  userId: string,
  type: string,
  since: Date,
): Promise<number> {
  return prisma.emailEvent.count({ where: { userId, type, createdAt: { gt: since } } });
}

/** Registra um e-mail enviado (para a contagem do rate-limit). */
export async function recordEmailEvent(
  prisma: PrismaClient,
  userId: string,
  type: string,
): Promise<void> {
  await prisma.emailEvent.create({ data: { userId, type } });
}
