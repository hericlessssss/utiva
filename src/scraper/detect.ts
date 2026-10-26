import type { PrismaClient } from '@prisma/client';
import { listSeenAuctionIds, upsertAuction } from '../db/auction-repo.js';
import { diffNewAuctions } from './diff.js';
import { parseAuctionList, type AuctionListEntry } from './list-parser.js';

/**
 * Fase 1 ponta a ponta (§5/§7-A), a partir do HTML já obtido: parseia a lista,
 * descobre os IDs novos contra o que está persistido, persiste os novos e os devolve
 * (para o worker enfileirar o e-mail de "char novo"). Não toca na rede — o HTML vem
 * do `fetchPage` do http-client.
 */
export async function detectNewAuctions(
  prisma: PrismaClient,
  html: string,
): Promise<AuctionListEntry[]> {
  const entries = parseAuctionList(html);
  const seen = await listSeenAuctionIds(
    prisma,
    entries.map((entry) => entry.auctionId),
  );
  const fresh = diffNewAuctions(seen, entries);

  // Upsert de todos: insere os novos e refresca lance/last_seen dos já vistos (§5-passo 3).
  // O diff já foi calculado antes, então `fresh` reflete o estado pré-upsert.
  for (const entry of entries) {
    await upsertAuction(prisma, entry);
  }

  return fresh;
}
