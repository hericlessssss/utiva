import type { PrismaClient } from '@prisma/client';
import type PgBoss from 'pg-boss';
import { enqueueNewAuction } from './queue/new-auction-queue.js';
import type { FetchPageOptions } from './scraper/http-client.js';
import { runActiveFilters } from './scraper/tick.js';

/**
 * Composição do fluxo A: roda os watch_filters ativos e enfileira um alerta de "char
 * novo" por leilão detectado. Devolve quantos jobs foram enfileirados. É o que o cron
 * chama a cada ciclo (§7-A).
 */
export async function enqueueNewForActiveFilters(
  prisma: PrismaClient,
  boss: PgBoss,
  opts: FetchPageOptions = {},
): Promise<number> {
  let enqueued = 0;

  // O enqueue roda dentro do detect, ANTES de marcar o match (at-least-once).
  await runActiveFilters(prisma, opts, async (entry) => {
    await enqueueNewAuction(boss, entry);
    enqueued++;
  });

  return enqueued;
}
