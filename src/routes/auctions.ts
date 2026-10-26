import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

/** Leitura dos leilões detectados (consumido pelo frontend). */
export async function auctionRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient },
): Promise<void> {
  const { prisma } = opts;

  app.get('/auctions', () =>
    prisma.auction.findMany({
      orderBy: { firstSeenAt: 'desc' },
      include: { watched: true },
      take: 200, // leilões acumulam sem limpeza; cap os mais recentes (v1 single-user)
    }),
  );

  app.get<{ Params: { id: string } }>('/auctions/:id', async (req, reply) => {
    const auctionId = Number(req.params.id);
    if (!Number.isInteger(auctionId)) return reply.code(400).send({ error: 'id inválido' });

    const auction = await prisma.auction.findUnique({
      where: { auctionId },
      include: { watched: true },
    });
    if (!auction) return reply.code(404).send({ error: 'leilão não encontrado' });
    return auction;
  });
}
