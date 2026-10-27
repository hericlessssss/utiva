import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

// UUID nulo: usado no filtro de `watched` quando não há usuário logado — não casa com
// nenhum user real, então o include volta vazio (watched = null) sem um branch extra na query.
const NO_USER = '00000000-0000-0000-0000-000000000000';

/** Achata o array `watched` (0 ou 1, já filtrado pelo usuário) no shape que o frontend espera. */
function shapeWatched<T extends { watched: { enabled: boolean }[] }>(
  a: T,
): Omit<T, 'watched'> & { watched: { enabled: boolean } | null } {
  const { watched, ...rest } = a;
  return { ...rest, watched: watched[0] ? { enabled: watched[0].enabled } : null };
}

/** Leitura dos leilões detectados (consumido pelo frontend). Pública; `watched` é do logado. */
export async function auctionRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient; optionalUser: PreHandler },
): Promise<void> {
  const { prisma, optionalUser } = opts;
  // Rota pública: injeta req.user quando há sessão, senão null (nunca nega).
  app.addHook('preHandler', optionalUser);

  app.get('/auctions', async (req) => {
    const rows = await prisma.auction.findMany({
      orderBy: { firstSeenAt: 'desc' },
      include: { watched: { where: { userId: req.user?.id ?? NO_USER } } },
      omit: { attributes: true }, // a lista não usa o breakdown da fase 2; só o detalhe carrega
      take: 200, // leilões acumulam sem limpeza; cap os mais recentes
    });
    return rows.map(shapeWatched);
  });

  app.get<{ Params: { id: string } }>('/auctions/:id', async (req, reply) => {
    const auctionId = Number(req.params.id);
    if (!Number.isInteger(auctionId)) return reply.code(400).send({ error: 'id inválido' });

    const auction = await prisma.auction.findUnique({
      where: { auctionId },
      include: { watched: { where: { userId: req.user?.id ?? NO_USER } } },
    });
    if (!auction) return reply.code(404).send({ error: 'leilão não encontrado' });
    return shapeWatched(auction);
  });
}
