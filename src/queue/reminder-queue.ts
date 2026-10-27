import type PgBoss from 'pg-boss';
import { buildReminderEmail } from '../mailer/reminder-email.js';
import { deliverToUser, type DeliverDeps } from '../mailer/user-mailer.js';
import { reminderSchedule } from '../reminders/thresholds.js';

export const REMINDER_QUEUE = 'auction-end-reminder';

export interface ReminderJob {
  userId: string;
  auctionId: number;
  label: string;
}

export async function ensureReminderQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(REMINDER_QUEUE);
}

/**
 * Agenda os lembretes de fim de um leilão: um job por threshold ainda futuro, disparando
 * em `fim - antecedência` via `startAfter` (§7-B). `singletonKey` por (leilão, threshold)
 * evita jobs duplicados se o acompanhamento for religado. Devolve quantos foram agendados.
 */
// Leilões vão até 28 dias; a retenção default (~14d) purgaria o job antes de disparar.
const JOB_RETENTION_DAYS = 35;

export async function scheduleReminders(
  boss: PgBoss,
  userId: string,
  auctionId: number,
  endAt: Date,
  now: Date = new Date(),
): Promise<number> {
  const reminders = reminderSchedule(endAt, now);
  let scheduled = 0;
  for (const reminder of reminders) {
    const jobId = await boss.send(
      REMINDER_QUEUE,
      { userId, auctionId, label: reminder.label } satisfies ReminderJob,
      {
        startAfter: reminder.at,
        retentionDays: JOB_RETENTION_DAYS,
        // singletonKey por (usuário, leilão, threshold): não duplica se o toggle for religado,
        // e usuários diferentes acompanhando o mesmo leilão têm jobs independentes.
        singletonKey: `${userId}:${auctionId}:${reminder.label}`,
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
      },
    );
    if (jobId) scheduled++; // null = deduplicado pelo singletonKey
  }
  return scheduled;
}

/** Deps do worker = deps do `deliverToUser` (prisma + mailer, com cap/janela injetáveis). */
export type ReminderWorkerDeps = DeliverDeps;

/**
 * Worker dos lembretes. No disparo, só envia se o leilão ainda está acompanhado (enabled)
 * e não terminou — é o que substitui o "cancelar jobs" ao desligar o toggle (§7-B). A entrega
 * passa pelo `deliverToUser` (gate de opt-in + rate-limit, Fase 4).
 * Assume batchSize=1 (default): 1 job por batch, então um erro re-tenta só esse job. Se
 * batchSize for aumentado, isolar cada job (try/catch) pra não re-enviar os já entregues.
 */
export async function registerReminderWorker(boss: PgBoss, deps: ReminderWorkerDeps): Promise<void> {
  await boss.work<ReminderJob>(REMINDER_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { userId, auctionId, label } = job.data;

      // Só envia se ESTE usuário ainda acompanha o leilão (toggle ligado)...
      const watched = await deps.prisma.watchedAuction.findUnique({
        where: { userId_auctionId: { userId, auctionId } },
      });
      if (!watched?.enabled) continue; // não acompanhado ou toggle desligado

      const auction = await deps.prisma.auction.findUnique({ where: { auctionId } });
      if (!auction) continue;
      if (auction.endAt.getTime() <= Date.now()) continue; // já terminou

      // ...e entrega pro dono (resolve e-mail + aplica opt-in/rate-limit no `deliverToUser`).
      const result = await deliverToUser(
        deps,
        userId,
        buildReminderEmail({ auctionId, charName: auction.charName, endAt: auction.endAt }, label),
      );
      if (result === 'rate-limited') {
        console.warn(`[reminder] usuário ${userId} no teto de e-mails — lembrete dropado`);
      }
    }
  });
}
