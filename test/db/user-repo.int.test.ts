import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createSession,
  deleteSession,
  findUserBySession,
  upsertUserByGoogle,
} from '../../src/db/user-repo.js';
import { hashSessionToken, type GoogleIdentity } from '../../src/auth/oidc.js';

const prisma = new PrismaClient();

const identity: GoogleIdentity = {
  sub: 'google-sub-1',
  email: 'jogador@gmail.com',
  emailVerified: true,
  name: 'Jogador',
  picture: 'https://foto',
};

describe('user-repo (integração)', () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('upsert cria e depois atualiza o mesmo usuário pelo google_sub', async () => {
    const created = await upsertUserByGoogle(prisma, identity);
    expect(created.email).toBe('jogador@gmail.com');

    const updated = await upsertUserByGoogle(prisma, { ...identity, email: 'novo@gmail.com', name: 'Novo' });
    expect(updated.id).toBe(created.id);
    expect(updated.email).toBe('novo@gmail.com');
    expect(updated.name).toBe('Novo');
    expect(await prisma.user.count()).toBe(1);
  });

  it('createSession guarda só o hash; findUserBySession resolve pelo token cru', async () => {
    const user = await upsertUserByGoogle(prisma, identity);
    const { token } = await createSession(prisma, user.id);

    const stored = await prisma.session.findFirst();
    expect(stored!.id).toBe(hashSessionToken(token));
    expect(stored!.id).not.toBe(token);

    const found = await findUserBySession(prisma, token);
    expect(found!.id).toBe(user.id);
  });

  it('token desconhecido devolve null', async () => {
    expect(await findUserBySession(prisma, 'inexistente')).toBeNull();
  });

  it('sessão expirada devolve null e é apagada', async () => {
    const user = await upsertUserByGoogle(prisma, identity);
    const { token } = await createSession(prisma, user.id, -1000); // já nasce vencida

    expect(await findUserBySession(prisma, token)).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it('deleteSession encerra a sessão e é idempotente', async () => {
    const user = await upsertUserByGoogle(prisma, identity);
    const { token } = await createSession(prisma, user.id);

    await deleteSession(prisma, token);
    expect(await findUserBySession(prisma, token)).toBeNull();
    await expect(deleteSession(prisma, token)).resolves.toBeUndefined(); // 2ª vez não lança
  });
});
