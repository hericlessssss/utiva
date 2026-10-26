import type { PrismaClient } from '@prisma/client';
import { recordMatch, upsertAuction } from '../db/auction-repo.js';
import { parseAuctionList, type AuctionListEntry } from './list-parser.js';

/**
 * Fase 1 para um preset (§5/§7-A), a partir do HTML já obtido: parseia a lista,
 * persiste/refresca todos os leilões e devolve os que são NOVOS PARA ESTE watch_filter.
 *
 * A novidade é por (filtro, leilão) via auction_match (§6) — não pela mera existência do
 * leilão —, pra presets sobrepostos alertarem cada um corretamente. O diff global de IDs
 * (`diffNewAuctions`/`listSeenAuctionIds`) fica para a fase 2 (buscar o detalhe só de IDs
 * globalmente novos). Não toca na rede — o HTML vem do `fetchPage`.
 */
export async function detectNewAuctions(
  prisma: PrismaClient,
  html: string,
  watchFilterId: number,
): Promise<AuctionListEntry[]> {
  const entries = parseAuctionList(html);
  const fresh: AuctionListEntry[] = [];

  for (const entry of entries) {
    await upsertAuction(prisma, entry);
    if (await recordMatch(prisma, entry.auctionId, watchFilterId)) fresh.push(entry);
  }

  return fresh;
}
