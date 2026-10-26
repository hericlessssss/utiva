import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

export interface FilterBody {
  world?: string | null;
  pvpType?: string | null;
  battleye?: string | null;
  vocation?: string | null;
  levelFrom?: number | null;
  levelTo?: number | null;
  skillId?: string | null;
  skillFrom?: number | null;
  skillTo?: number | null;
  search?: string | null;
  active?: boolean;
}

const nullableString = { type: ['string', 'null'] } as const;
const nullableInt = { type: ['integer', 'null'], minimum: 0 } as const;

const filterBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    world: nullableString,
    pvpType: nullableString,
    battleye: nullableString,
    vocation: nullableString,
    levelFrom: nullableInt,
    levelTo: nullableInt,
    skillId: nullableString,
    skillFrom: nullableInt,
    skillTo: nullableInt,
    search: nullableString,
    active: { type: 'boolean' },
  },
} as const;

function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

/** Valida ranges (só quando ambos os limites vêm no payload) — evita preset impossível. */
function rangeError(body: FilterBody): string | null {
  if (body.levelFrom != null && body.levelTo != null && body.levelFrom > body.levelTo) {
    return 'levelFrom não pode ser maior que levelTo';
  }
  if (body.skillFrom != null && body.skillTo != null && body.skillFrom > body.skillTo) {
    return 'skillFrom não pode ser maior que skillTo';
  }
  return null;
}

/** CRUD dos presets de busca (watch_filter). v1 single-user, sem auth. */
export async function filterRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient },
): Promise<void> {
  const { prisma } = opts;

  app.get('/filters', () => prisma.watchFilter.findMany({ orderBy: { id: 'asc' } }));

  app.post<{ Body: FilterBody }>(
    '/filters',
    { schema: { body: filterBodySchema } },
    async (req, reply) => {
      const err = rangeError(req.body);
      if (err) return reply.code(400).send({ error: err });
      const created = await prisma.watchFilter.create({ data: req.body });
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string }; Body: FilterBody }>(
    '/filters/:id',
    { schema: { body: filterBodySchema } },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'id inválido' });
      const err = rangeError(req.body);
      if (err) return reply.code(400).send({ error: err });
      try {
        return await prisma.watchFilter.update({ where: { id }, data: req.body });
      } catch (err) {
        if (isNotFound(err)) return reply.code(404).send({ error: 'filtro não encontrado' });
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/filters/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'id inválido' });
    try {
      await prisma.watchFilter.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      if (isNotFound(err)) return reply.code(404).send({ error: 'filtro não encontrado' });
      throw err;
    }
  });
}
