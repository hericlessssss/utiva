import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { detectNewAuctions } from '../../src/scraper/detect.js';
import { makeUser } from '../helpers/auth.js';

const fixture = readFileSync(new URL('../fixtures/list-page-1.html', import.meta.url), 'utf8');
const prisma = new PrismaClient();
let userId: string;

async function newFilter(): Promise<number> {
  const filter = await prisma.watchFilter.create({ data: { userId } });
  return filter.id;
}

describe('detectNewAuctions (integração, ponta a ponta fase 1)', () => {
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

  it('primeira passada detecta e persiste todos os leilões da página', async () => {
    const fresh = await detectNewAuctions(prisma, fixture, await newFilter());

    expect(fresh.map((e) => e.auctionId)).toEqual([2292063, 2292077, 2292089]);
    expect(await prisma.auction.count()).toBe(3);
  });

  it('segunda passada do mesmo filtro não detecta nada novo', async () => {
    const filterId = await newFilter();
    await detectNewAuctions(prisma, fixture, filterId);

    const fresh = await detectNewAuctions(prisma, fixture, filterId);

    expect(fresh).toEqual([]);
    expect(await prisma.auction.count()).toBe(3);
  });

  it('refresca o lance de um leilão já visto numa passada seguinte', async () => {
    const filterId = await newFilter();
    await detectNewAuctions(prisma, fixture, filterId);
    const updated = fixture.replace('<b>3,000</b>', '<b>5,000</b>');

    const fresh = await detectNewAuctions(prisma, updated, filterId);

    expect(fresh).toEqual([]);
    const row = await prisma.auction.findUniqueOrThrow({ where: { auctionId: 2292063 } });
    expect(row.currentBid).toBe(5000);
  });

  it('um segundo filtro que captura o mesmo leilão também alerta (novidade por-filtro)', async () => {
    const filterA = await newFilter();
    const filterB = await newFilter();
    await detectNewAuctions(prisma, fixture, filterA);

    const freshB = await detectNewAuctions(prisma, fixture, filterB);

    expect(freshB.map((e) => e.auctionId)).toEqual([2292063, 2292077, 2292089]);
  });
});
