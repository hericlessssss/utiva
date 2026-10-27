import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmEmailByToken } from '../../src/db/email-repo.js';
import type { EmailMessage, MailerConfig } from '../../src/mailer/mailer.js';
import {
  VERIFICATION_QUEUE,
  ensureVerificationQueue,
  registerVerificationWorker,
  requestVerification,
} from '../../src/queue/verification-queue.js';
import { makeUser } from '../helpers/auth.js';

const prisma = new PrismaClient();
const boss = new PgBoss(process.env.DATABASE_URL!);
const baseUrl = 'http://localhost:3000';

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

describe('fila de confirmação (integração)', () => {
  beforeAll(async () => {
    await boss.start();
    await ensureVerificationQueue(boss);
    await boss.purgeQueue(VERIFICATION_QUEUE);
    await registerVerificationWorker(boss, { mailer, baseUrl });
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await boss.stop();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    received.length = 0;
    notify = () => {};
  });

  it('requestVerification enfileira o e-mail; o link confirma o e-mail', async () => {
    const user = await makeUser(prisma, 'novo@x', false);
    const done = new Promise<void>((r) => {
      notify = r;
    });

    expect(await requestVerification(prisma, boss, user)).toBe('sent');
    await done;

    const link = received[0]!.text.match(/token=([^\s]+)/)?.[1];
    expect(link).toBeTruthy();
    expect(received[0]!.to).toBe('novo@x');

    const confirmed = await confirmEmailByToken(prisma, decodeURIComponent(link!));
    expect(confirmed?.id).toBe(user.id);
    expect(confirmed?.emailOptInAt).not.toBeNull();
  });

  it('reenvio dentro do cooldown é throttled (não spamma)', async () => {
    const user = await makeUser(prisma, 'repete@x', false);
    expect(await requestVerification(prisma, boss, user)).toBe('sent');
    expect(await requestVerification(prisma, boss, user)).toBe('throttled');
  });

  it('troca de e-mail no cooldown não é throttled (novo endereço precisa de link)', async () => {
    const user = await makeUser(prisma, 'antigo@x', false);
    expect(await requestVerification(prisma, boss, user)).toBe('sent');
    // E-mail muda (como no upsert do login); o opt-in já estava pendente.
    const moved = await prisma.user.update({ where: { id: user.id }, data: { email: 'novo@x' } });
    expect(await requestVerification(prisma, boss, moved)).toBe('sent');
  });

  it('usuário já confirmado não recebe confirmação', async () => {
    const user = await makeUser(prisma, 'confirmado@x'); // opt-in já setado
    expect(await requestVerification(prisma, boss, user)).toBe('confirmed');
  });
});
