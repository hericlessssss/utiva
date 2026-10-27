import { type PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

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

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** CRUD dos presets de busca (watch_filter), escopado ao usuário logado (requireUser → 401). */
export async function filterRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient; requireUser: PreHandler },
): Promise<void> {
  const { prisma, requireUser } = opts;
  // Todo acesso a /filters exige login; o hook injeta req.user (garantido não-nulo adiante).
  app.addHook('preHandler', requireUser);

  app.get('/filters', (req) =>
    prisma.watchFilter.findMany({ where: { userId: req.user!.id }, orderBy: { id: 'asc' } }),
  );

  app.post<{ Body: FilterBody }>(
    '/filters',
    { schema: { body: filterBodySchema } },
    async (req, reply) => {
      const err = rangeError(req.body);
      if (err) return reply.code(400).send({ error: err });
      const created = await prisma.watchFilter.create({
        data: { ...req.body, userId: req.user!.id },
      });
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string }; Body: FilterBody }>(
    '/filters/:id',
    { schema: { body: filterBodySchema } },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'id inválido' });

      // Só enxerga/edita filtro do próprio usuário (ownership) — filtro de outro dá 404.
      const existing = await prisma.watchFilter.findFirst({ where: { id, userId: req.user!.id } });
      if (!existing) return reply.code(404).send({ error: 'filtro não encontrado' });

      // Valida o estado MESCLADO (um update parcial não pode deixar o range impossível).
      const rangeErr = rangeError({ ...existing, ...req.body });
      if (rangeErr) return reply.code(400).send({ error: rangeErr });

      return prisma.watchFilter.update({ where: { id }, data: req.body });
    },
  );

  app.delete<{ Params: { id: string } }>('/filters/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'id inválido' });
    // deleteMany com o userId no where: remove só se for do dono; count 0 = inexistente/alheio.
    const { count } = await prisma.watchFilter.deleteMany({ where: { id, userId: req.user!.id } });
    if (count === 0) return reply.code(404).send({ error: 'filtro não encontrado' });
    return reply.code(204).send();
  });
}
