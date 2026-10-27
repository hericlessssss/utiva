import type { PrismaClient, User, WatchFilter } from '@prisma/client';
import { auctionsNeedingDetail, saveAuctionDetail } from '../db/auction-repo.js';
import type { FetchPageFn } from './cf-clearance.js';
import { detectNewAuctions, type OnNewAuction } from './detect.js';
import { parseAuctionDetail } from './detail-parser.js';
import { CloudflareBlockedError, fetchPage, type FetchPageOptions } from './http-client.js';
import type { AuctionListEntry } from './list-parser.js';
import { buildDetailUrl, buildListUrl, type ListFilter } from './url.js';

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

/** Filtro ativo com o dono embutido — o fluxo A precisa do e-mail pra alertar quem o criou. */
export type WatchFilterWithUser = WatchFilter & { user: User };

/** Callback por char novo que também recebe o filtro (e, nele, o dono) que o capturou. */
export type OnNewForFilter = (
  entry: AuctionListEntry,
  filter: WatchFilterWithUser,
) => Promise<void>;

/**
 * Um ciclo de scraping para um preset (§5/§7-A): monta a URL, busca a página 1,
 * detecta os leilões novos, registra os matches do filtro e devolve os novos
 * (para o worker enfileirar o e-mail de "char novo" pro dono do filtro).
 */
export async function runFilterTick(
  prisma: PrismaClient,
  filter: WatchFilterWithUser,
  opts: FetchPageOptions = {},
  onNew?: OnNewForFilter,
  fetchPageFn: FetchPageFn = fetchPage,
): Promise<AuctionListEntry[]> {
  const html = await fetchPageFn(buildListUrl(watchFilterToListFilter(filter)), opts);
  // detect trabalha por entrada; aqui "fechamos" o filtro no callback pra o chamador saber o dono.
  const onNewEntry: OnNewAuction | undefined = onNew
    ? (entry) => onNew(entry, filter)
    : undefined;
  return detectNewAuctions(prisma, html, filter.id, onNewEntry);
}

/** Roda um tick para cada watch_filter ativo, em sequência (baixa concorrência, §5). */
export async function runActiveFilters(
  prisma: PrismaClient,
  opts: FetchPageOptions = {},
  onNew?: OnNewForFilter,
  fetchPageFn: FetchPageFn = fetchPage,
): Promise<Map<number, AuctionListEntry[]>> {
  const filters = await prisma.watchFilter.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
    include: { user: true },
  });

  const byFilter = new Map<number, AuctionListEntry[]>();
  for (const filter of filters) {
    try {
      byFilter.set(filter.id, await runFilterTick(prisma, filter, opts, onNew, fetchPageFn));
    } catch (err) {
      // Um filtro que falha (403/rede) não pode impedir os outros no mesmo ciclo.
      console.error(`[tick] filtro ${filter.id} falhou:`, err);
      byFilter.set(filter.id, []);
    }
  }

  return byFilter;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fase 2 do scraper (§5): busca e persiste o detalhe dos leilões que ainda não o têm
 * (`attributes` nulo), um por vez (baixa concorrência) e com `delayMs` entre requests —
 * o CLAUDE.md exige delays entre chamadas ao tibia.com pra não provocar 403/challenge.
 * Um detalhe que falha (parse, rede) é logado e pulado — fica nulo e é re-tentado no
 * próximo ciclo. Um bloqueio persistente do Cloudflare encerra o backfill do ciclo (o
 * cookie precisa renovar; não adianta insistir no resto). Devolve quantos foram salvos.
 */
export async function runDetailBackfill(
  prisma: PrismaClient,
  opts: FetchPageOptions = {},
  limit = 10,
  delayMs = 1500,
  sleep: (ms: number) => Promise<void> = realSleep,
  fetchPageFn: FetchPageFn = fetchPage,
): Promise<number> {
  const ids = await auctionsNeedingDetail(prisma, limit);
  let saved = 0;

  for (let i = 0; i < ids.length; i++) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    const id = ids[i]!;
    try {
      const detail = parseAuctionDetail(await fetchPageFn(buildDetailUrl(id), opts));
      await saveAuctionDetail(prisma, id, detail);
      saved++;
    } catch (err) {
      console.error(`[detail] leilão ${id} falhou:`, err);
      if (err instanceof CloudflareBlockedError) break;
    }
  }

  return saved;
}
