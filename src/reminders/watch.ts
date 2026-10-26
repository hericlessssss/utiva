import type { PrismaClient } from '@prisma/client';
import type PgBoss from 'pg-boss';
import { scheduleReminders } from '../queue/reminder-queue.js';

/**
 * Liga/desliga o acompanhamento de um leilão (toggle, §7-B). Ao ligar, agenda os lembretes
 * de fim; ao desligar, basta marcar enabled=false (o worker pula no disparo).
 * Assume que o leilão existe (a rota valida antes).
 */
export async function setWatched(
  prisma: PrismaClient,
  boss: PgBoss,
  auctionId: number,
  enabled: boolean,
): Promise<void> {
  await prisma.watchedAuction.upsert({
    where: { auctionId },
    create: { auctionId, enabled },
    update: { enabled },
  });

  if (enabled) {
    const auction = await prisma.auction.findUnique({ where: { auctionId } });
    if (auction) await scheduleReminders(boss, auctionId, auction.endAt);
  }
}
