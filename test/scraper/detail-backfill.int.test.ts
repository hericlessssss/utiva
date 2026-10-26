import { readFileSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuctionDetail } from '../../src/scraper/detail-parser.js';
import type { Fetcher } from '../../src/scraper/http-client.js';
import { runDetailBackfill } from '../../src/scraper/tick.js';

const prisma = new PrismaClient();
const fixture = readFileSync(new URL('../fixtures/auction-detail.html', import.meta.url), 'utf8');

function seedAuction(auctionId: number): Promise<unknown> {
  return prisma.auction.create({
    data: {
      auctionId,
      charName: `char-${auctionId}`,
      world: 'Antica',
      vocation: 'Elite Knight',
      sex: 'Male',
      level: 100,
      // Futuro: auctionsNeedingDetail só detalha leilões que ainda não terminaram.
      endAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  });
}

const serveFixture = (): Fetcher => vi.fn(async () => ({ statusCode: 200, body: fixture }));
// delayMs=0 e sleep no-op: sem espera real entre fetches no teste.
const backfill = (fetcher: Fetcher, limit = 10): Promise<number> =>
  runDetailBackfill(prisma, { fetcher }, limit, 0);

describe('runDetailBackfill (integração)', () => {
  beforeEach(async () => {
    await prisma.auctionMatch.deleteMany();
    await prisma.auction.deleteMany();
  });

  afterAll(async () => {
    await prisma.auction.deleteMany();
    await prisma.$disconnect();
  });

  it('busca e salva o detalhe de quem não tem attributes, e para de buscá-lo depois', async () => {
    await seedAuction(2291946);
    const fetcher = serveFixture();

    expect(await backfill(fetcher)).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const row = await prisma.auction.findUniqueOrThrow({ where: { auctionId: 2291946 } });
    const attrs = row.attributes as unknown as AuctionDetail;
    expect(attrs.skills).toHaveLength(8);
    expect(attrs.imbuements[0]).toBe('Powerful Bash');
    expect(attrs.general['Hit Points']).toBe('2,795');

    // Segundo ciclo: já tem detalhe → não consulta a rede de novo.
    expect(await backfill(fetcher)).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('não detalha leilões finalizados', async () => {
    await seedAuction(111);
    await prisma.auction.update({ where: { auctionId: 111 }, data: { status: 'finished' } });
    const fetcher = serveFixture();

    expect(await backfill(fetcher)).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('não detalha leilão ativo que já terminou (saiu da lista, evita re-fetch eterno)', async () => {
    await seedAuction(222);
    await prisma.auction.update({
      where: { auctionId: 222 },
      data: { endAt: new Date(Date.now() - 60_000) },
    });
    const fetcher = serveFixture();

    expect(await backfill(fetcher)).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('respeita o limite por ciclo (o resto fica para os próximos)', async () => {
    for (const id of [201, 202, 203]) await seedAuction(id);
    const fetcher = serveFixture();

    expect(await backfill(fetcher, 2)).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await prisma.auction.count({ where: { attributes: { equals: Prisma.DbNull } } })).toBe(1);
  });
});
