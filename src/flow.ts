import type { PrismaClient } from '@prisma/client';
import type PgBoss from 'pg-boss';
import { enqueueNewAuction } from './queue/new-auction-queue.js';
import type { FetchPageFn } from './scraper/cf-clearance.js';
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
  fetchPageFn?: FetchPageFn,
): Promise<number> {
  // O enqueue roda dentro do detect, ANTES de marcar o match (at-least-once). O mapa
  // devolvido traz exatamente os chars novos por filtro — somamos pra ter o total. O alerta
  // vai pro dono do filtro; o e-mail é resolvido do banco no envio (fluxo por usuário).
  const byFilter = await runActiveFilters(
    prisma,
    opts,
    (entry, filter) => enqueueNewAuction(boss, entry, { userId: filter.userId }),
    fetchPageFn,
  );

  let enqueued = 0;
  for (const fresh of byFilter.values()) enqueued += fresh.length;
  return enqueued;
}
