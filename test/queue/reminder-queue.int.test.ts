import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage, MailerConfig } from '../../src/mailer/mailer.js';
import {
  REMINDER_QUEUE,
  ensureReminderQueue,
  registerReminderWorker,
} from '../../src/queue/reminder-queue.js';
import { makeUser } from '../helpers/auth.js';

const prisma = new PrismaClient();
const boss = new PgBoss(process.env.DATABASE_URL!);
let userId: string;
const userEmail = 'dono@utiva.test';

const received: EmailMessage[] = [];
let notify: () => void = () => {};
const mailer: MailerConfig = {
  from: 'bot@utiva',
  to: 'me@x',
  transport: (msg) => {
    received.push(msg);
    notify();
    return Promise.resolve();
  },
};

async function seedAuction(auctionId: number, status: 'active' | 'finished' = 'active') {
  await prisma.auction.create({
    data: {
      auctionId,
      charName: 'Kord Di',
      world: 'Secura',
      vocation: 'Elite Knight',
      sex: 'Female',
      level: 100,
      endAt: new Date('2026-11-01T18:00:00Z'),
      status,
    },
  });
}

describe('reminder worker (integração)', () => {
  beforeAll(async () => {
    await boss.start();
    await ensureReminderQueue(boss);
    await boss.purgeQueue(REMINDER_QUEUE);
    await registerReminderWorker(boss, { prisma, mailer });
    await prisma.watchedAuction.deleteMany();
    await prisma.user.deleteMany();
    userId = (await makeUser(prisma, userEmail)).id;
  });

  afterAll(async () => {
    await boss.stop();
    await prisma.watchedAuction.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    received.length = 0;
    notify = () => {};
    await prisma.watchedAuction.deleteMany();
    await prisma.auction.deleteMany();
  });

  it('envia o lembrete pro dono quando o leilão está acompanhado e ativo', async () => {
    await seedAuction(2292063);
    await prisma.watchedAuction.create({ data: { userId, auctionId: 2292063, enabled: true } });
    const done = new Promise<void>((r) => {
      notify = r;
    });

    await boss.send(REMINDER_QUEUE, { userId, auctionId: 2292063, label: '1h' });
    await done;

    expect(received[0]!.subject).toContain('Kord Di');
    expect(received[0]!.subject).toContain('1h');
    expect(received[0]!.to).toBe(userEmail); // foi pro e-mail do dono
  });

  it('não envia quando o acompanhamento está desligado', async () => {
    await seedAuction(2292077);
    await prisma.watchedAuction.create({ data: { userId, auctionId: 2292077, enabled: false } });

    await boss.send(REMINDER_QUEUE, { userId, auctionId: 2292077, label: '1h' });
    await new Promise((r) => setTimeout(r, 2500));

    expect(received).toHaveLength(0);
  });
});
