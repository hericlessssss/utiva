import type { PrismaClient } from '@prisma/client';
import { hasMatch, recordMatch, upsertAuction } from '../db/auction-repo.js';
import { parseAuctionList, type AuctionListEntry } from './list-parser.js';

/** Callback chamado para cada char novo ANTES de marcá-lo como alertado (ex.: enfileirar o e-mail). */
export type OnNewAuction = (entry: AuctionListEntry) => Promise<void>;

const noop: OnNewAuction = () => Promise.resolve();

/**
 * Fase 1 para um preset (§5/§7-A), a partir do HTML já obtido: parseia a lista,
 * persiste/refresca todos os leilões e devolve os NOVOS PARA ESTE watch_filter.
 *
 * Novidade é por (filtro, leilão) via auction_match (§6). Para cada char novo, chama
 * `onNew` (ex.: enfileira o alerta) e SÓ DEPOIS marca o match — assim um crash entre
 * detectar e notificar re-tenta no próximo ciclo (at-least-once) em vez de perder o alerta.
 */
export async function detectNewAuctions(
  prisma: PrismaClient,
  html: string,
  watchFilterId: number,
  onNew: OnNewAuction = noop,
): Promise<AuctionListEntry[]> {
  const entries = parseAuctionList(html);
  const fresh: AuctionListEntry[] = [];

  for (const entry of entries) {
    await upsertAuction(prisma, entry);
    if (await hasMatch(prisma, entry.auctionId, watchFilterId)) continue;

    await onNew(entry);
    await recordMatch(prisma, entry.auctionId, watchFilterId);
    fresh.push(entry);
  }

  return fresh;
}
