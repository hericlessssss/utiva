import type { PrismaClient } from '@prisma/client';
import type { AuctionListEntry } from '../scraper/list-parser.js';

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

/** Já existe um match deste leilão com este watch_filter? (peek, não marca) */
export async function hasMatch(
  prisma: PrismaClient,
  auctionId: number,
  watchFilterId: number,
): Promise<boolean> {
  const found = await prisma.auctionMatch.findUnique({
    where: { auctionId_watchFilterId: { auctionId, watchFilterId } },
    select: { id: true },
  });
  return found !== null;
}

/** Marca (idempotente) que um watch_filter capturou um leilão (§6/§7-A). */
export async function recordMatch(
  prisma: PrismaClient,
  auctionId: number,
  watchFilterId: number,
): Promise<void> {
  await prisma.auctionMatch.createMany({
    data: [{ auctionId, watchFilterId }],
    skipDuplicates: true,
  });
}
