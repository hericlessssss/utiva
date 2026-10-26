import type { PrismaClient } from '@prisma/client';
import type PgBoss from 'pg-boss';
import { sendReminderAlert, type MailerConfig } from '../mailer/mailer.js';
import { reminderSchedule } from '../reminders/thresholds.js';

export const REMINDER_QUEUE = 'auction-end-reminder';

export interface ReminderJob {
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
  auctionId: number,
  endAt: Date,
  now: Date = new Date(),
): Promise<number> {
  const reminders = reminderSchedule(endAt, now);
  let scheduled = 0;
  for (const reminder of reminders) {
    const jobId = await boss.send(
      REMINDER_QUEUE,
      { auctionId, label: reminder.label } satisfies ReminderJob,
      {
        startAfter: reminder.at,
        retentionDays: JOB_RETENTION_DAYS,
        singletonKey: `${auctionId}:${reminder.label}`,
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
      },
    );
    if (jobId) scheduled++; // null = deduplicado pelo singletonKey
  }
  return scheduled;
}

export interface ReminderWorkerDeps {
  prisma: PrismaClient;
  mailer: MailerConfig;
}

/**
 * Worker dos lembretes. No disparo, só envia se o leilão ainda está acompanhado (enabled)
 * e não terminou — é o que substitui o "cancelar jobs" ao desligar o toggle (§7-B).
 * Assume batchSize=1 (default): 1 job por batch, então um erro re-tenta só esse job. Se
 * batchSize for aumentado, isolar cada job (try/catch) pra não re-enviar os já entregues.
 */
export async function registerReminderWorker(boss: PgBoss, deps: ReminderWorkerDeps): Promise<void> {
  await boss.work<ReminderJob>(REMINDER_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { auctionId, label } = job.data;

      const auction = await deps.prisma.auction.findUnique({
        where: { auctionId },
        include: { watched: true },
      });
      if (!auction?.watched?.enabled) continue; // não acompanhado ou toggle desligado
      if (auction.endAt.getTime() <= Date.now()) continue; // já terminou

      await sendReminderAlert(
        deps.mailer,
        { auctionId, charName: auction.charName, endAt: auction.endAt },
        label,
      );
    }
  });
}
