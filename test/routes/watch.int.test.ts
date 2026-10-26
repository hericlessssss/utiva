import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ensureReminderQueue } from '../../src/queue/reminder-queue.js';

const prisma = new PrismaClient();
const boss = new PgBoss(process.env.DATABASE_URL!);
const app: FastifyInstance = buildApp({ prisma, boss });

async function seedAuction(auctionId: number) {
  await prisma.auction.create({
    data: {
      auctionId,
      charName: 'Kord Di',
      world: 'Secura',
      vocation: 'Elite Knight',
      sex: 'Female',
      level: 100,
      endAt: new Date('2026-12-01T18:00:00Z'),
      status: 'active',
    },
  });
}

describe('rota /auctions/:id/watch (integração)', () => {
  beforeAll(async () => {
    await boss.start();
    await ensureReminderQueue(boss);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await boss.stop();
    await prisma.watchedAuction.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.watchedAuction.deleteMany();
    await prisma.auction.deleteMany();
  });

  it('PUT marca o leilão como acompanhado', async () => {
    await seedAuction(2292063);

    const res = await app.inject({
      method: 'PUT',
      url: '/auctions/2292063/watch',
      payload: { enabled: true },
    });

    expect(res.statusCode).toBe(200);
    const watched = await prisma.watchedAuction.findUnique({ where: { auctionId: 2292063 } });
    expect(watched?.enabled).toBe(true);
  });

  it('PUT com enabled=false desliga', async () => {
    await seedAuction(2292063);
    await app.inject({ method: 'PUT', url: '/auctions/2292063/watch', payload: { enabled: true } });

    await app.inject({ method: 'PUT', url: '/auctions/2292063/watch', payload: { enabled: false } });

    const watched = await prisma.watchedAuction.findUnique({ where: { auctionId: 2292063 } });
    expect(watched?.enabled).toBe(false);
  });

  it('PUT em leilão inexistente dá 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auctions/999999/watch',
      payload: { enabled: true },
    });

    expect(res.statusCode).toBe(404);
  });

  it('PUT rejeita payload inválido (400)', async () => {
    await seedAuction(2292063);

    const res = await app.inject({
      method: 'PUT',
      url: '/auctions/2292063/watch',
      payload: { enabled: 'sim' },
    });

    expect(res.statusCode).toBe(400);
  });
});
