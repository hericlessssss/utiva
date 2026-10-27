import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { finishEndedAuctions, hasMatch, recordMatch, upsertAuction } from '../../src/db/auction-repo.js';
import type { AuctionListEntry } from '../../src/scraper/list-parser.js';
import { makeUser } from '../helpers/auth.js';

const prisma = new PrismaClient();
let userId: string;

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
    outfit: null,
    displayItems: [],
    ...over,
  };
}

describe('auction-repo (integração)', () => {
  beforeAll(async () => {
    await prisma.watchFilter.deleteMany();
    await prisma.user.deleteMany();
    userId = (await makeUser(prisma)).id;
  });

  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.watchFilter.deleteMany();
  });

  afterAll(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.watchFilter.deleteMany();
    await prisma.user.deleteMany();
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

  it('finishEndedAuctions: marca active+terminado como finished e ignora o resto', async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    await upsertAuction(prisma, entry(10, { endsAt: past })); // ativo, terminou → finished
    await upsertAuction(prisma, entry(11, { endsAt: future })); // ativo, rodando → intocado
    await upsertAuction(prisma, entry(12, { endsAt: past }));
    await prisma.auction.update({ where: { auctionId: 12 }, data: { status: 'cancelled' } }); // já resolvido → intocado

    expect(await finishEndedAuctions(prisma)).toBe(1);

    const row = async (id: number) => prisma.auction.findUniqueOrThrow({ where: { auctionId: id } });
    expect((await row(10)).status).toBe('finished');
    expect((await row(11)).status).toBe('active');
    expect((await row(12)).status).toBe('cancelled');
    // A varredura só mexe em `status`: o leilão marcado preserva os demais campos (ex.: bid).
    expect((await row(10)).currentBid).toBe(50);
  });

  it('finishEndedAuctions: idempotente — nada a marcar numa segunda passada', async () => {
    await upsertAuction(prisma, entry(13, { endsAt: new Date(Date.now() - 60_000) }));

    expect(await finishEndedAuctions(prisma)).toBe(1);
    expect(await finishEndedAuctions(prisma)).toBe(0);
  });

  it('hasMatch/recordMatch: marca idempotente e hasMatch reflete', async () => {
    await upsertAuction(prisma, entry(2292063));
    const filter = await prisma.watchFilter.create({ data: { userId } });

    expect(await hasMatch(prisma, 2292063, filter.id)).toBe(false);

    await recordMatch(prisma, 2292063, filter.id);
    await recordMatch(prisma, 2292063, filter.id);

    expect(await hasMatch(prisma, 2292063, filter.id)).toBe(true);
    expect(await prisma.auctionMatch.count()).toBe(1);
  });
});
