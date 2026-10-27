import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loginCookies, makeUser, testAuth } from '../helpers/auth.js';

const prisma = new PrismaClient();
const app: FastifyInstance = buildApp({ prisma, auth: testAuth });
let userId: string;
let cookies: Record<string, string>;

function auctionData(auctionId: number, over: Record<string, unknown> = {}) {
  return {
    auctionId,
    charName: `char-${auctionId}`,
    world: 'Secura',
    vocation: 'Elite Knight',
    sex: 'Male',
    level: 100,
    endAt: new Date('2026-12-01T18:00:00Z'),
    status: 'active' as const,
    ...over,
  };
}

describe('rotas /auctions (integração)', () => {
  beforeAll(async () => {
    await app.ready();
    await prisma.watchedAuction.deleteMany();
    await prisma.user.deleteMany();
    userId = (await makeUser(prisma)).id;
    cookies = await loginCookies(prisma, userId);
  });

  afterAll(async () => {
    await app.close();
    await prisma.watchedAuction.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.watchedAuction.deleteMany();
    await prisma.auction.deleteMany();
  });

  it('GET /auctions traz o watched do usuário logado (e null pros não acompanhados)', async () => {
    await prisma.auction.create({ data: auctionData(1, { firstSeenAt: new Date('2026-10-01T00:00:00Z') }) });
    await prisma.auction.create({ data: auctionData(2, { firstSeenAt: new Date('2026-10-02T00:00:00Z') }) });
    await prisma.watchedAuction.create({ data: { userId, auctionId: 2, enabled: true } });

    const res = await app.inject({ method: 'GET', url: '/auctions', cookies });

    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.map((a: { auctionId: number }) => a.auctionId)).toEqual([2, 1]);
    expect(list[0].watched.enabled).toBe(true);
    expect(list[1].watched).toBeNull();
  });

  it('GET /auctions anônimo (sem login) é público e traz watched null', async () => {
    await prisma.auction.create({ data: auctionData(1) });
    await prisma.watchedAuction.create({ data: { userId, auctionId: 1, enabled: true } });

    const res = await app.inject({ method: 'GET', url: '/auctions' });

    expect(res.statusCode).toBe(200);
    expect(res.json()[0].watched).toBeNull(); // acompanhamento é de outro (o logado); anônimo não vê
  });

  it('GET /auctions/:id devolve o leilão', async () => {
    await prisma.auction.create({ data: auctionData(5) });

    const res = await app.inject({ method: 'GET', url: '/auctions/5' });

    expect(res.statusCode).toBe(200);
    expect(res.json().charName).toBe('char-5');
  });

  it('GET /auctions/:id dá 404 se não existe e 400 se o id é inválido', async () => {
    expect((await app.inject({ method: 'GET', url: '/auctions/999999' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/auctions/abc' })).statusCode).toBe(400);
  });
});
