import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { enqueueNewForActiveFilters } from '../src/flow.js';
import type { EmailMessage } from '../src/mailer/mailer.js';
import { NEW_AUCTION_QUEUE, ensureQueues, registerNewAuctionWorker } from '../src/queue/new-auction-queue.js';
import type { Fetcher } from '../src/scraper/http-client.js';

const fixture = readFileSync(new URL('./fixtures/list-page-1.html', import.meta.url), 'utf8');
const prisma = new PrismaClient();
const boss = new PgBoss(process.env.DATABASE_URL!);
const fixtureFetcher: Fetcher = () => Promise.resolve({ statusCode: 200, body: fixture });

describe('fluxo A ponta a ponta (integração)', () => {
  beforeAll(async () => {
    await boss.start();
    await ensureQueues(boss);
    await boss.purgeQueue(NEW_AUCTION_QUEUE);
  });

  afterAll(async () => {
    await boss.stop();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.watchFilter.deleteMany();
  });

  it('tick acha novos → enfileira → worker envia um e-mail por char', async () => {
    const received: EmailMessage[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    await registerNewAuctionWorker(boss, {
      from: 'bot@utiva',
      to: 'me@x',
      transport: (msg) => {
        received.push(msg);
        if (received.length === 3) resolveDone();
        return Promise.resolve();
      },
    });
    await prisma.watchFilter.create({ data: { world: 'Secura' } });

    const enqueued = await enqueueNewForActiveFilters(prisma, boss, { fetcher: fixtureFetcher });
    expect(enqueued).toBe(3);

    await done;
    expect(received).toHaveLength(3);
    expect(received.map((m) => m.subject).join(' | ')).toContain('Kord Di');
  });
});
