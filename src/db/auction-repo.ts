import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuctionDetail } from '../scraper/detail-parser.js';
import type { AuctionListEntry } from '../scraper/list-parser.js';

/**
 * Insere ou atualiza o snapshot de um leilão a partir de uma entrada da lista (fase 1).
 * `firstSeenAt`/`lastSeenAt` usam o default do schema na criação; no update, bump de `lastSeenAt`.
 */
export async function upsertAuction(prisma: PrismaClient, entry: AuctionListEntry): Promise<void> {
  // O card mostra SÓ um lance (mínimo antes de haver lances, atual depois). Escreve apenas
  // o que foi visto e não zera o outro — senão o preço inicial some quando aparece um lance.
  const bid = entry.bid.kind === 'current' ? { currentBid: entry.bid.amount } : { minBid: entry.bid.amount };

  const fields = {
    charName: entry.characterName,
    world: entry.world,
    vocation: entry.vocation,
    sex: entry.sex,
    level: entry.level,
    endAt: entry.endsAt,
    ...bid,
  };

  await prisma.auction.upsert({
    where: { auctionId: entry.auctionId },
    create: { auctionId: entry.auctionId, ...fields },
    update: { ...fields, lastSeenAt: new Date() },
  });
}

/**
 * IDs de leilões ainda não detalhados (fase 2): `attributes` nulo, ativos e que ainda não
 * terminaram (`endAt` no futuro). Excluir os já encerrados evita re-tentar p/ sempre quem
 * saiu da lista mas nunca foi marcado `finished` (a varredura de fim ainda é pendente, §13) —
 * senão cada ciclo queimaria requests do tibia.com à toa. Cap por `limit` (§5).
 */
export async function auctionsNeedingDetail(
  prisma: PrismaClient,
  limit = 10,
): Promise<number[]> {
  const rows = await prisma.auction.findMany({
    where: { status: 'active', attributes: { equals: Prisma.DbNull }, endAt: { gt: new Date() } },
    orderBy: { firstSeenAt: 'desc' }, // detalha primeiro os mais recentes (os que acabaram de alertar)
    select: { auctionId: true },
    take: limit,
  });
  return rows.map((r) => r.auctionId);
}

/**
 * Persiste o breakdown do detalhe (fase 2) de um leilão em `attributes` (jsonb). NÃO toca em
 * `lastSeenAt` — esse campo é "visto por último na lista" (fase 1), base da futura varredura
 * de fim (§13); bumpá-lo aqui faria um leilão que já sumiu da lista parecer recém-visto.
 */
export async function saveAuctionDetail(
  prisma: PrismaClient,
  auctionId: number,
  detail: AuctionDetail,
): Promise<void> {
  await prisma.auction.update({
    where: { auctionId },
    data: { attributes: detail as unknown as Prisma.InputJsonValue },
  });
}

/** Já existe um match deste leilão com este watch_filter? (peek, não marca) */
export async function hasMatch(
  prisma: PrismaClient,
  auctionId: number,
  watchFilterId: number,
): Promise<boolean> {
  const found = await prisma.auctionMatch.findUnique({
    where: { auctionId_watchFilterId: { auctionId, watchFilterId } },
    select: { id: true },
  });
  return found !== null;
}

/** Marca (idempotente) que um watch_filter capturou um leilão (§6/§7-A). */
export async function recordMatch(
  prisma: PrismaClient,
  auctionId: number,
  watchFilterId: number,
): Promise<void> {
  await prisma.auctionMatch.createMany({
    data: [{ auctionId, watchFilterId }],
    skipDuplicates: true,
  });
}
