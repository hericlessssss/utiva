import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listSeenAuctionIds, recordMatch, upsertAuction } from '../../src/db/auction-repo.js';
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

  it('listSeenAuctionIds devolve só os ids da página que já existem', async () => {
    await upsertAuction(prisma, entry(2292063));

    expect(await listSeenAuctionIds(prisma, [2292063, 999])).toEqual([2292063]);
    expect(await listSeenAuctionIds(prisma, [999])).toEqual([]);
    expect(await listSeenAuctionIds(prisma, [])).toEqual([]);
  });

  it('reupsert do mesmo id não duplica e atualiza o lance', async () => {
    await upsertAuction(prisma, entry(1, { bid: { amount: 10, kind: 'minimum' } }));
    await upsertAuction(prisma, entry(1, { bid: { amount: 99, kind: 'current' } }));

    expect(await listSeenAuctionIds(prisma, [1])).toEqual([1]);

    const row = await prisma.auction.findUniqueOrThrow({ where: { auctionId: 1 } });
    expect(row.currentBid).toBe(99);
    expect(row.minBid).toBeNull();
  });

  it('recordMatch liga auction e watch_filter, devolvendo true só na primeira vez', async () => {
    await upsertAuction(prisma, entry(2292063));
    const filter = await prisma.watchFilter.create({ data: {} });

    expect(await recordMatch(prisma, 2292063, filter.id)).toBe(true);
    expect(await recordMatch(prisma, 2292063, filter.id)).toBe(false);
    expect(await prisma.auctionMatch.count()).toBe(1);
  });
});
