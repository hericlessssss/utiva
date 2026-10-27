import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { enqueueNewForActiveFilters } from '../src/flow.js';
import type { EmailMessage } from '../src/mailer/mailer.js';
import { NEW_AUCTION_QUEUE, ensureQueues, registerNewAuctionWorker } from '../src/queue/new-auction-queue.js';
import type { Fetcher } from '../src/scraper/http-client.js';
import { makeUser } from './helpers/auth.js';

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
    await prisma.watchFilter.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.watchFilter.deleteMany();
    await prisma.user.deleteMany();
  });

  it('tick acha novos → enfileira → worker envia um e-mail por char pro dono do filtro', async () => {
    const received: EmailMessage[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    await registerNewAuctionWorker(boss, {
      prisma,
      mailer: {
        from: 'bot@utiva',
        to: 'fallback@x', // só fallback: o e-mail real sai pro dono do filtro
        transport: (msg) => {
          received.push(msg);
          if (received.length === 3) resolveDone();
          return Promise.resolve();
        },
      },
    });
    const user = await makeUser(prisma, 'dono@utiva.test');
    await prisma.watchFilter.create({ data: { world: 'Secura', userId: user.id } });

    const enqueued = await enqueueNewForActiveFilters(prisma, boss, { fetcher: fixtureFetcher });
    expect(enqueued).toBe(3);

    await done;
    expect(received).toHaveLength(3);
    expect(received.map((m) => m.subject).join(' | ')).toContain('Kord Di');
    expect(received.every((m) => m.to === 'dono@utiva.test')).toBe(true); // foi pro dono, não pro MAIL_TO
  });
});
