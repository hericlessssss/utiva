import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { detectNewAuctions } from '../../src/scraper/detect.js';

const fixture = readFileSync(new URL('../fixtures/list-page-1.html', import.meta.url), 'utf8');
const prisma = new PrismaClient();

describe('detectNewAuctions (integração, ponta a ponta fase 1)', () => {
  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
  });

  afterAll(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.$disconnect();
  });

  it('primeira passada detecta e persiste todos os leilões da página', async () => {
    const fresh = await detectNewAuctions(prisma, fixture);

    expect(fresh.map((e) => e.auctionId)).toEqual([2292063, 2292077, 2292089]);
    expect(await prisma.auction.count()).toBe(3);
  });

  it('segunda passada com o mesmo HTML não detecta nada novo', async () => {
    await detectNewAuctions(prisma, fixture);
    const fresh = await detectNewAuctions(prisma, fixture);

    expect(fresh).toEqual([]);
    expect(await prisma.auction.count()).toBe(3);
  });

  it('refresca o lance de um leilão já visto numa passada seguinte', async () => {
    await detectNewAuctions(prisma, fixture);
    const updated = fixture.replace('<b>3,000</b>', '<b>5,000</b>');

    const fresh = await detectNewAuctions(prisma, updated);

    expect(fresh).toEqual([]);
    const row = await prisma.auction.findUniqueOrThrow({ where: { auctionId: 2292063 } });
    expect(row.currentBid).toBe(5000);
  });
});
