import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasMatch, recordMatch, upsertAuction } from '../../src/db/auction-repo.js';
import type { AuctionListEntry } from '../../src/scraper/list-parser.js';

const prisma = new PrismaClient();

function entry(auctionId: number, over: Partial<AuctionListEntry> = {}): AuctionListEntry {
  return {
    auctionId,
    characterName: `char-${auctionId}`,
    level: 100,
    vocation: 'Elite Knight',
    sex: 'Male',
    world: 'Antica',
    endsAt: new Date('2026-10-26T18:00:00Z'),
    bid: { amount: 50, kind: 'current' },
    ...over,
  };
}

describe('auction-repo (integração)', () => {
  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.watchFilter.deleteMany();
  });

  afterAll(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.watchFilter.deleteMany();
    await prisma.$disconnect();
  });

  it('reupsert atualiza o lance atual e preserva o mínimo visto antes', async () => {
    await upsertAuction(prisma, entry(1, { bid: { amount: 10, kind: 'minimum' } }));
    await upsertAuction(prisma, entry(1, { bid: { amount: 99, kind: 'current' } }));

    expect(await prisma.auction.count()).toBe(1);

    const row = await prisma.auction.findUniqueOrThrow({ where: { auctionId: 1 } });
    expect(row.currentBid).toBe(99);
    expect(row.minBid).toBe(10); // preservado (não zerado pelo update)
  });

  it('hasMatch/recordMatch: marca idempotente e hasMatch reflete', async () => {
    await upsertAuction(prisma, entry(2292063));
    const filter = await prisma.watchFilter.create({ data: {} });

    expect(await hasMatch(prisma, 2292063, filter.id)).toBe(false);

    await recordMatch(prisma, 2292063, filter.id);
    await recordMatch(prisma, 2292063, filter.id);

    expect(await hasMatch(prisma, 2292063, filter.id)).toBe(true);
    expect(await prisma.auctionMatch.count()).toBe(1);
  });
});
