import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loginCookies, makeUser, testAuth } from '../helpers/auth.js';

const prisma = new PrismaClient();
const app: FastifyInstance = buildApp({ prisma, auth: testAuth });

let userId: string;
let cookies: Record<string, string>;

async function create(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/filters', payload, cookies });
}

describe('rotas /filters (integração)', () => {
  beforeAll(async () => {
    await app.ready();
    await prisma.watchFilter.deleteMany();
    await prisma.user.deleteMany();
    userId = (await makeUser(prisma)).id;
    cookies = await loginCookies(prisma, userId);
  });

  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.watchFilter.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.watchFilter.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('sem login, toda rota /filters dá 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/filters' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/filters', payload: { world: 'Antica' } })).statusCode,
    ).toBe(401);
  });

  it('POST cria (201) e GET lista só os do usuário', async () => {
    const res = await create({ world: 'Antica', levelFrom: 100 });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.id).toBeTypeOf('number');
    expect(created.world).toBe('Antica');
    expect(created.active).toBe(true);
    expect(created.userId).toBe(userId);

    const list = await app.inject({ method: 'GET', url: '/filters', cookies });
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
      cookies,
    });

    expect(res.statusCode).toBe(400);
  });

  it('PATCH atualiza o filtro', async () => {
    const id = (await create({})).json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/filters/${id}`,
      payload: { active: false },
      cookies,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
  });

  it('DELETE remove (204); id inexistente dá 404', async () => {
    const id = (await create({})).json().id;

    expect((await app.inject({ method: 'DELETE', url: `/filters/${id}`, cookies })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/filters/${id}`, cookies })).statusCode).toBe(404);
  });

  it('não enxerga nem mexe em filtro de outro usuário (ownership → 404)', async () => {
    // filtro de OUTRO usuário
    const other = await makeUser(prisma, 'outro@utiva.test');
    const alien = await prisma.watchFilter.create({ data: { world: 'Antica', userId: other.id } });

    // não aparece na lista do usuário atual
    expect((await app.inject({ method: 'GET', url: '/filters', cookies })).json()).toHaveLength(0);
    // PATCH e DELETE no filtro alheio → 404 (como se não existisse)
    expect(
      (await app.inject({ method: 'PATCH', url: `/filters/${alien.id}`, payload: { active: false }, cookies }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/filters/${alien.id}`, cookies })).statusCode,
    ).toBe(404);
    // e continua intacto
    expect(await prisma.watchFilter.findUnique({ where: { id: alien.id } })).not.toBeNull();
  });
});
