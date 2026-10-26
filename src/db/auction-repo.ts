import type { PrismaClient } from '@prisma/client';
import type { AuctionListEntry } from '../scraper/list-parser.js';

/**
 * Dado os IDs da página atual, devolve quais já estão persistidos — o "conjunto visto"
 * do diff (§5). Consulta só os IDs da página (não a tabela inteira, que cresce sem limite).
 */
export async function listSeenAuctionIds(
  prisma: PrismaClient,
  pageIds: number[],
): Promise<number[]> {
  if (pageIds.length === 0) return [];
  const rows = await prisma.auction.findMany({
    where: { auctionId: { in: pageIds } },
    select: { auctionId: true },
  });
  return rows.map((row) => row.auctionId);
}

/**
 * Insere ou atualiza o snapshot de um leilão a partir de uma entrada da lista (fase 1).
 * `firstSeenAt`/`lastSeenAt` usam o default do schema na criação; no update, bump de `lastSeenAt`.
 */
export async function upsertAuction(prisma: PrismaClient, entry: AuctionListEntry): Promise<void> {
  const currentBid = entry.bid.kind === 'current' ? entry.bid.amount : null;
  const minBid = entry.bid.kind === 'minimum' ? entry.bid.amount : null;

  const fields = {
    charName: entry.characterName,
    world: entry.world,
    vocation: entry.vocation,
    sex: entry.sex,
    level: entry.level,
    endAt: entry.endsAt,
    currentBid,
    minBid,
  };

  await prisma.auction.upsert({
    where: { auctionId: entry.auctionId },
    create: { auctionId: entry.auctionId, ...fields },
    update: { ...fields, lastSeenAt: new Date() },
  });
}
