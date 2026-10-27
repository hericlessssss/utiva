import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  confirmEmailByToken,
  countEmailEventsSince,
  issueEmailVerification,
  latestVerification,
  recordEmailEvent,
} from '../../src/db/email-repo.js';
import { makeUser } from '../helpers/auth.js';

const prisma = new PrismaClient();

describe('email-repo (integração)', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany(); // cascata limpa email_verification + email_event
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('issueEmailVerification guarda só o hash e mantém um token por usuário', async () => {
    const user = await makeUser(prisma, 'a@x', false);

    const first = await issueEmailVerification(prisma, user.id, user.email);
    const second = await issueEmailVerification(prisma, user.id, user.email);

    expect(first.token).not.toBe(second.token);
    const rows = await prisma.emailVerification.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1); // o segundo substituiu o primeiro
    expect(rows[0]!.id).not.toBe(first.token); // persistimos o hash, não o token cru
  });

  it('confirmEmailByToken válido seta o opt-in e consome os tokens', async () => {
    const user = await makeUser(prisma, 'b@x', false);
    const { token } = await issueEmailVerification(prisma, user.id, user.email);

    const confirmed = await confirmEmailByToken(prisma, token);

    expect(confirmed?.id).toBe(user.id);
    expect(confirmed?.emailOptInAt).not.toBeNull();
    expect(await prisma.emailVerification.count({ where: { userId: user.id } })).toBe(0);
  });

  it('token expirado não confirma', async () => {
    const user = await makeUser(prisma, 'c@x', false);
    const t0 = Date.now();
    const { token } = await issueEmailVerification(prisma, user.id, user.email, 1000, t0);

    const confirmed = await confirmEmailByToken(prisma, token, t0 + 2000);

    expect(confirmed).toBeNull();
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.emailOptInAt).toBeNull();
  });

  it('token não vale se o e-mail do usuário mudou', async () => {
    const user = await makeUser(prisma, 'd@x', false);
    const { token } = await issueEmailVerification(prisma, user.id, 'd@x');
    await prisma.user.update({ where: { id: user.id }, data: { email: 'novo@x' } });

    expect(await confirmEmailByToken(prisma, token)).toBeNull();
  });

  it('token inexistente devolve null', async () => {
    expect(await confirmEmailByToken(prisma, 'nao-existe')).toBeNull();
  });

  it('conta e registra email_event na janela', async () => {
    const user = await makeUser(prisma, 'e@x');
    const since = new Date(Date.now() - 60_000);

    expect(await countEmailEventsSince(prisma, user.id, 'alert', since)).toBe(0);
    await recordEmailEvent(prisma, user.id, 'alert');
    await recordEmailEvent(prisma, user.id, 'alert');
    await recordEmailEvent(prisma, user.id, 'limit');

    expect(await countEmailEventsSince(prisma, user.id, 'alert', since)).toBe(2);
    expect(await countEmailEventsSince(prisma, user.id, 'limit', since)).toBe(1);
  });

  it('latestVerification devolve o instante + e-mail do último token (ou null)', async () => {
    const user = await makeUser(prisma, 'f@x', false);
    expect(await latestVerification(prisma, user.id)).toBeNull();

    await issueEmailVerification(prisma, user.id, user.email);
    const last = await latestVerification(prisma, user.id);
    expect(last?.createdAt).toBeInstanceOf(Date);
    expect(last?.email).toBe('f@x');
  });
});
