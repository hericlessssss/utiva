import type { PrismaClient, User } from '@prisma/client';
import type PgBoss from 'pg-boss';
import { issueEmailVerification, latestVerification } from '../db/email-repo.js';
import { sendEmail, type MailerConfig } from '../mailer/mailer.js';
import { buildVerificationEmail } from '../mailer/verification-email.js';

export const VERIFICATION_QUEUE = 'email-verification';

/** Intervalo mínimo entre envios de confirmação pro mesmo usuário (anti-spam de reenvio). */
export const VERIFICATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export interface VerificationJob {
  userId: string;
  /** Destinatário (e-mail que o token confirma). */
  email: string;
  /** Token cru — o worker monta o link com ele. */
  token: string;
}

export async function ensureVerificationQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(VERIFICATION_QUEUE);
}

/** O que `requestVerification` fez — a rota de reenvio mapeia isso pro status HTTP. */
export type VerificationRequestResult = 'sent' | 'throttled' | 'confirmed';

/**
 * Pede uma confirmação de e-mail pro usuário (1º login ou reenvio). Não faz nada se já
 * confirmado; respeita o cooldown pra não spammar em logins repetidos; senão emite um token
 * novo e enfileira o e-mail. Idempotente dentro da janela do cooldown.
 */
export async function requestVerification(
  prisma: PrismaClient,
  boss: PgBoss,
  user: User,
  now = Date.now(),
): Promise<VerificationRequestResult> {
  if (user.emailOptInAt) return 'confirmed';

  // Throttle só vale pro MESMO e-mail: se o endereço mudou (upsert resetou o opt-in), o novo
  // precisa de um link próprio, então não deixamos o cooldown do token antigo bloquear.
  const last = await latestVerification(prisma, user.id);
  const sameEmail = last?.email === user.email;
  if (last && sameEmail && now - last.createdAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS) {
    return 'throttled';
  }

  const { token } = await issueEmailVerification(prisma, user.id, user.email, undefined, now);
  try {
    await boss.send(
      VERIFICATION_QUEUE,
      { userId: user.id, email: user.email, token } satisfies VerificationJob,
      { retryLimit: 5, retryDelay: 60, retryBackoff: true },
    );
  } catch (err) {
    // Enfileirar falhou: desfaz o token pra não queimar o cooldown (o usuário pode tentar já).
    await prisma.emailVerification.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    throw err;
  }
  return 'sent';
}

export interface VerificationWorkerDeps {
  mailer: MailerConfig;
  /** Origem pública da app (ex.: http://localhost:3000); o link aponta pra `/auth/verify-email`. */
  baseUrl: string;
}

/** Worker que envia o e-mail de confirmação com o link montado a partir do `baseUrl`. */
export async function registerVerificationWorker(
  boss: PgBoss,
  deps: VerificationWorkerDeps,
): Promise<void> {
  await boss.work<VerificationJob>(VERIFICATION_QUEUE, async (jobs) => {
    for (const { data } of jobs) {
      const link = `${deps.baseUrl}/auth/verify-email?token=${encodeURIComponent(data.token)}`;
      await sendEmail(deps.mailer, buildVerificationEmail(link), data.email);
    }
  });
}
