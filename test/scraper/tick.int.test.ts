import { readFileSync } from 'node:fs';
import { PrismaClient, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Fetcher } from '../../src/scraper/http-client.js';
import { runActiveFilters, runFilterTick } from '../../src/scraper/tick.js';
import { makeUser } from '../helpers/auth.js';

const fixture = readFileSync(new URL('../fixtures/list-page-1.html', import.meta.url), 'utf8');
const prisma = new PrismaClient();
const fixtureFetcher: Fetcher = () => Promise.resolve({ statusCode: 200, body: fixture });
let user: User;

describe('runFilterTick / runActiveFilters (integração)', () => {
  beforeAll(async () => {
    await prisma.watchFilter.deleteMany();
    await prisma.user.deleteMany();
    user = await makeUser(prisma);
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

  it('runFilterTick detecta, persiste e registra os matches do filtro', async () => {
    const filter = await prisma.watchFilter.create({ data: { world: 'Secura', userId: user.id } });

    const fresh = await runFilterTick(prisma, { ...filter, user }, { fetcher: fixtureFetcher });

    expect(fresh.map((e) => e.auctionId)).toEqual([2292063, 2292077, 2292089]);
    expect(await prisma.auction.count()).toBe(3);
    expect(await prisma.auctionMatch.count()).toBe(3);
  });

  it('um filtro que falha não impede os outros no mesmo ciclo', async () => {
    const failing = await prisma.watchFilter.create({ data: { world: 'Secura', userId: user.id } });
    const ok = await prisma.watchFilter.create({ data: { world: 'Antica', userId: user.id } });
    const fetcher: Fetcher = (url) =>
      url.includes('Secura')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ statusCode: 200, body: fixture });

    const result = await runActiveFilters(prisma, {
      fetcher,
      sleep: () => Promise.resolve(),
      maxRetries: 0,
    });

    expect(result.get(failing.id)).toEqual([]);
    expect(result.get(ok.id)?.map((e) => e.auctionId)).toEqual([2292063, 2292077, 2292089]);
  });

  it('runActiveFilters roda só os filtros ativos', async () => {
    await prisma.watchFilter.create({ data: { world: 'Secura', active: true, userId: user.id } });
    await prisma.watchFilter.create({ data: { world: 'Antica', active: false, userId: user.id } });

    const result = await runActiveFilters(prisma, { fetcher: fixtureFetcher });

    expect(result.size).toBe(1);
    expect([...result.values()][0]!.map((e) => e.auctionId)).toEqual([2292063, 2292077, 2292089]);
  });
});
