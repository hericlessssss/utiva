import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMessage } from '../../src/mailer/mailer.js';
import {
  NEW_AUCTION_QUEUE,
  ensureQueues,
  enqueueNewAuction,
  registerNewAuctionWorker,
} from '../../src/queue/new-auction-queue.js';
import type { AuctionListEntry } from '../../src/scraper/list-parser.js';
import { makeUser } from '../helpers/auth.js';

const entry: AuctionListEntry = {
  auctionId: 2292063,
  characterName: 'Kord Di',
  level: 562,
  vocation: 'Elite Knight',
  sex: 'Female',
  world: 'Secura',
  endsAt: new Date('2026-10-26T18:00:00Z'),
  bid: { amount: 3000, kind: 'current' },
  outfit: null,
  displayItems: [],
};

const prisma = new PrismaClient();
const boss = new PgBoss(process.env.DATABASE_URL!);

describe('fila new-auction (integração)', () => {
  beforeAll(async () => {
    await boss.start();
    await ensureQueues(boss);
    await boss.purgeQueue(NEW_AUCTION_QUEUE);
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await boss.stop();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('enqueue dispara o worker, que entrega pro e-mail do dono do filtro', async () => {
    const received: EmailMessage[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const user = await makeUser(prisma, 'dono@x'); // confirmado (double opt-in)
    await registerNewAuctionWorker(boss, {
      prisma,
      mailer: {
        from: 'bot@utiva',
        to: 'fallback@x',
        transport: (msg) => {
          received.push(msg);
          resolveDone();
          return Promise.resolve();
        },
      },
    });
    await enqueueNewAuction(boss, entry, { userId: user.id });
    await done;

    expect(received[0]!.to).toBe('dono@x'); // vai pro dono do filtro, não pro MAIL_TO global
    expect(received[0]!.subject).toContain('Kord Di');
  });
});
