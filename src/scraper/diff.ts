import type { AuctionListEntry } from './list-parser.js';

/**
 * Fase 1, passo 2 da detecção (§5): dado o conjunto de `auctionId`s já vistos e as
 * entradas da página atual, devolve só as entradas novas, preservando a ordem da página.
 */
export function diffNewAuctions(
  seenIds: Iterable<number>,
  entries: AuctionListEntry[],
): AuctionListEntry[] {
  const seen = new Set(seenIds);
  return entries.filter((entry) => !seen.has(entry.auctionId));
}
