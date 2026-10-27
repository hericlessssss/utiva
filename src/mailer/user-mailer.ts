import type { PrismaClient } from '@prisma/client';
import { countEmailEventsSince, recordEmailEvent } from '../db/email-repo.js';
import { buildLimitNoticeEmail } from './limit-notice-email.js';
import { sendEmail, type MailerConfig } from './mailer.js';
import type { EmailContent } from './new-auction-email.js';

/** Teto de e-mails de alerta por usuário por janela (Fase 4). */
export const EMAIL_DAILY_CAP = 50;
/** Janela deslizante do rate-limit: 24h. */
export const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;

const EVENT_ALERT = 'alert';
const EVENT_LIMIT = 'limit';

export interface DeliverDeps {
  prisma: PrismaClient;
  mailer: MailerConfig;
  /** Teto por janela (default EMAIL_DAILY_CAP). */
  cap?: number;
  /** Tamanho da janela em ms (default EMAIL_WINDOW_MS). */
  windowMs?: number;
  /** Injetável nos testes. */
  now?: () => number;
}

/** Resultado da tentativa de entrega — útil pro chamador logar/contar. */
export type DeliverResult = 'sent' | 'unconfirmed' | 'no-user' | 'rate-limited';

/**
 * Entrega um alerta/lembrete pro e-mail do usuário, aplicando os controles da Fase 4:
 * 1. resolve o usuário pelo id (pega mudança de e-mail desde o enqueue);
 * 2. exige e-mail confirmado (double opt-in) — pendente/ausente nunca recebe;
 * 3. rate-limit: até `cap` alertas por janela. Ao estourar, droppa o excedente e manda UM
 *    aviso de limite por janela (deduplicado), sem contar no teto.
 *
 * É o chokepoint único dos dois fluxos de alerta — nenhum alerta sai fora daqui.
 */
export async function deliverToUser(
  deps: DeliverDeps,
  userId: string,
  content: EmailContent,
): Promise<DeliverResult> {
  const { prisma, mailer } = deps;
  const cap = deps.cap ?? EMAIL_DAILY_CAP;
  const windowMs = deps.windowMs ?? EMAIL_WINDOW_MS;
  const nowMs = deps.now?.() ?? Date.now();
  const since = new Date(nowMs - windowMs);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 'no-user';
  if (!user.emailOptInAt) return 'unconfirmed';

  // Rate-limit é check-then-act sem lock: se os dois fluxos (new-auction e reminder) entregarem
  // pro MESMO usuário no mesmo instante, o teto pode ser ultrapassado por pouco e o aviso de
  // limite sair duplicado. É um guard anti-abuso/custo (soft), não um limite rígido — essa
  // concorrência é rara e o excesso é benigno; serializar por usuário seria overengineering (v1).
  const sent = await countEmailEventsSince(prisma, userId, EVENT_ALERT, since);
  if (sent >= cap) {
    // Um aviso de limite por janela: só manda se ainda não avisou nesta janela.
    const notices = await countEmailEventsSince(prisma, userId, EVENT_LIMIT, since);
    if (notices === 0) {
      const windowHours = Math.round(windowMs / (60 * 60 * 1000));
      await sendEmail(mailer, buildLimitNoticeEmail(cap, windowHours), user.email);
      await recordEmailEvent(prisma, userId, EVENT_LIMIT);
    }
    return 'rate-limited';
  }

  await sendEmail(mailer, content, user.email);
  await recordEmailEvent(prisma, userId, EVENT_ALERT);
  return 'sent';
}
