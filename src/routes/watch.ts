import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type PgBoss from 'pg-boss';
import { setWatched } from '../reminders/watch.js';

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

const bodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['enabled'],
  properties: { enabled: { type: 'boolean' } },
} as const;

/** Toggle de acompanhamento de um leilão (§7-B), por usuário: PUT /auctions/:id/watch { enabled }. */
export async function watchRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient; boss: PgBoss; requireUser: PreHandler },
): Promise<void> {
  const { prisma, boss, requireUser } = opts;
  app.addHook('preHandler', requireUser); // acompanhar exige login

  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/auctions/:id/watch',
    { schema: { body: bodySchema } },
    async (req, reply) => {
      const auctionId = Number(req.params.id);
      if (!Number.isInteger(auctionId)) return reply.code(400).send({ error: 'id inválido' });

      const auction = await prisma.auction.findUnique({ where: { auctionId } });
      if (!auction) return reply.code(404).send({ error: 'leilão não encontrado' });

      await setWatched(prisma, boss, req.user!.id, auctionId, req.body.enabled);
      return { auctionId, enabled: req.body.enabled };
    },
  );
}
