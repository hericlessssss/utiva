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

const entry: AuctionListEntry = {
  auctionId: 2292063,
  characterName: 'Kord Di',
  level: 562,
  vocation: 'Elite Knight',
  sex: 'Female',
  world: 'Secura',
  endsAt: new Date('2026-10-26T18:00:00Z'),
  bid: { amount: 3000, kind: 'current' },
};

const boss = new PgBoss(process.env.DATABASE_URL!);

describe('fila new-auction (integração)', () => {
  beforeAll(async () => {
    await boss.start();
    await ensureQueues(boss);
    await boss.purgeQueue(NEW_AUCTION_QUEUE);
  });

  afterAll(async () => {
    await boss.stop();
  });

  it('enqueue dispara o worker, que envia pelo transport', async () => {
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
        resolveDone();
        return Promise.resolve();
      },
    });
    await enqueueNewAuction(boss, entry);
    await done;

    expect(received[0]!.to).toBe('me@x');
    expect(received[0]!.subject).toContain('Kord Di');
  });
});
