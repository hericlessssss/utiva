import type { PrismaClient, WatchFilter } from '@prisma/client';
import { detectNewAuctions } from './detect.js';
import { fetchPage, type FetchPageOptions } from './http-client.js';
import type { AuctionListEntry } from './list-parser.js';
import { buildListUrl, type ListFilter } from './url.js';

type WatchFilterParams = Pick<
  WatchFilter,
  | 'world'
  | 'pvpType'
  | 'battleye'
  | 'vocation'
  | 'levelFrom'
  | 'levelTo'
  | 'skillId'
  | 'skillFrom'
  | 'skillTo'
  | 'search'
>;

/** Converte um watch_filter persistido nos filtros da URL do bazar, ignorando nulos. */
export function watchFilterToListFilter(f: WatchFilterParams): ListFilter {
  return {
    world: f.world ?? undefined,
    worldPvpType: f.pvpType ?? undefined,
    worldBattleyeState: f.battleye ?? undefined,
    profession: f.vocation ?? undefined,
    levelFrom: f.levelFrom ?? undefined,
    levelTo: f.levelTo ?? undefined,
    skillId: f.skillId ?? undefined,
    skillFrom: f.skillFrom ?? undefined,
    skillTo: f.skillTo ?? undefined,
    search: f.search ?? undefined,
  };
}

/**
 * Um ciclo de scraping para um preset (§5/§7-A): monta a URL, busca a página 1,
 * detecta os leilões novos, registra os matches do filtro e devolve os novos
 * (para o worker enfileirar o e-mail de "char novo").
 */
export async function runFilterTick(
  prisma: PrismaClient,
  filter: WatchFilter,
  opts: FetchPageOptions = {},
): Promise<AuctionListEntry[]> {
  const html = await fetchPage(buildListUrl(watchFilterToListFilter(filter)), opts);
  return detectNewAuctions(prisma, html, filter.id);
}

/** Roda um tick para cada watch_filter ativo, em sequência (baixa concorrência, §5). */
export async function runActiveFilters(
  prisma: PrismaClient,
  opts: FetchPageOptions = {},
): Promise<Map<number, AuctionListEntry[]>> {
  const filters = await prisma.watchFilter.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
  });

  const byFilter = new Map<number, AuctionListEntry[]>();
  for (const filter of filters) {
    byFilter.set(filter.id, await runFilterTick(prisma, filter, opts));
  }

  return byFilter;
}
