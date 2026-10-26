import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

const prisma = new PrismaClient();
const app: FastifyInstance = buildApp({ prisma });

async function create(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/filters', payload });
}

describe('rotas /filters (integração)', () => {
  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.watchFilter.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.watchFilter.deleteMany();
    await prisma.$disconnect();
  });

  it('POST cria (201) e GET lista', async () => {
    const res = await create({ world: 'Antica', levelFrom: 100 });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.id).toBeTypeOf('number');
    expect(created.world).toBe('Antica');
    expect(created.active).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/filters' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
  });

  it('POST rejeita payload inválido (400)', async () => {
    expect((await create({ levelFrom: 'abc' })).statusCode).toBe(400);
    expect((await create({ naoExiste: 1 })).statusCode).toBe(400);
  });

  it('POST rejeita range invertido (levelFrom > levelTo) com 400', async () => {
    expect((await create({ levelFrom: 500, levelTo: 100 })).statusCode).toBe(400);
  });

  it('PATCH rejeita range que fica impossível após merge parcial (400)', async () => {
    const id = (await create({ levelTo: 10 })).json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/filters/${id}`,
      payload: { levelFrom: 50 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('PATCH atualiza o filtro', async () => {
    const id = (await create({})).json().id;

    const res = await app.inject({ method: 'PATCH', url: `/filters/${id}`, payload: { active: false } });

    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
  });

  it('DELETE remove (204); id inexistente dá 404', async () => {
    const id = (await create({})).json().id;

    expect((await app.inject({ method: 'DELETE', url: `/filters/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/filters/${id}` })).statusCode).toBe(404);
  });
});
