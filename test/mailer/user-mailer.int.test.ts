import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage, MailerConfig } from '../../src/mailer/mailer.js';
import { buildNewAuctionEmail } from '../../src/mailer/new-auction-email.js';
import { deliverToUser } from '../../src/mailer/user-mailer.js';
import type { AuctionListEntry } from '../../src/scraper/list-parser.js';
import { makeUser } from '../helpers/auth.js';

const prisma = new PrismaClient();

const entry: AuctionListEntry = {
  auctionId: 1,
  characterName: 'Kord Di',
  level: 100,
  vocation: 'Knight',
  sex: 'Male',
  world: 'Secura',
  endsAt: new Date('2026-11-01T18:00:00Z'),
  bid: { amount: 500, kind: 'current' },
  outfit: null,
  displayItems: [],
};
const content = buildNewAuctionEmail(entry);

let sent: EmailMessage[] = [];
const mailer: MailerConfig = {
  from: 'bot@utiva',
  to: 'fallback@x',
  transport: (msg) => {
    sent.push(msg);
    return Promise.resolve();
  },
};

describe('deliverToUser (integração)', () => {
  beforeEach(async () => {
    sent = [];
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('usuário inexistente → no-user, sem envio', async () => {
    expect(await deliverToUser({ prisma, mailer }, '00000000-0000-0000-0000-000000000000', content)).toBe(
      'no-user',
    );
    expect(sent).toHaveLength(0);
  });

  it('e-mail não confirmado → unconfirmed, sem envio (double opt-in)', async () => {
    const user = await makeUser(prisma, 'pendente@x', false);
    expect(await deliverToUser({ prisma, mailer }, user.id, content)).toBe('unconfirmed');
    expect(sent).toHaveLength(0);
  });

  it('confirmado e abaixo do teto → envia pro e-mail do usuário e registra o alerta', async () => {
    const user = await makeUser(prisma, 'ok@x');
    expect(await deliverToUser({ prisma, mailer }, user.id, content)).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ok@x');
    expect(await prisma.emailEvent.count({ where: { userId: user.id, type: 'alert' } })).toBe(1);
  });

  it('no teto: droppa o excedente e manda UM aviso de limite por janela', async () => {
    const user = await makeUser(prisma, 'cheio@x');
    const deps = { prisma, mailer, cap: 2 };

    expect(await deliverToUser(deps, user.id, content)).toBe('sent');
    expect(await deliverToUser(deps, user.id, content)).toBe('sent');
    // 3ª passa do teto (cap=2): alerta dropado + aviso de limite
    expect(await deliverToUser(deps, user.id, content)).toBe('rate-limited');
    // 4ª: ainda no teto, mas NÃO manda outro aviso (dedup por janela)
    expect(await deliverToUser(deps, user.id, content)).toBe('rate-limited');

    const alertMails = sent.filter((m) => m.subject.includes('Kord Di'));
    const limitMails = sent.filter((m) => m.subject.toLowerCase().includes('limite'));
    expect(alertMails).toHaveLength(2); // só os 2 abaixo do teto
    expect(limitMails).toHaveLength(1); // um único aviso
    expect(await prisma.emailEvent.count({ where: { userId: user.id, type: 'limit' } })).toBe(1);
  });
});
