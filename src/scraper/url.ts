const LIST_URL = 'https://www.tibia.com/charactertrade/';

/** Filtros do Char Bazaar (§5) — mapeiam 1:1 os parâmetros GET do site. */
export interface ListFilter {
  world?: string;
  worldPvpType?: string;
  worldBattleyeState?: string;
  profession?: string;
  levelFrom?: number;
  levelTo?: number;
  skillId?: string;
  skillFrom?: number;
  skillTo?: number;
  search?: string;
  /** Tipo da busca (§5): default '1'. Só vale junto de `search`. */
  searchType?: string;
}

const PARAM: Record<Exclude<keyof ListFilter, 'searchType'>, string> = {
  world: 'filter_world',
  worldPvpType: 'filter_worldpvptype',
  worldBattleyeState: 'filter_worldbattleyestate',
  profession: 'filter_profession',
  levelFrom: 'filter_levelrangefrom',
  levelTo: 'filter_levelrangeto',
  skillId: 'filter_skillid',
  skillFrom: 'filter_skillrangefrom',
  skillTo: 'filter_skillrangeto',
  search: 'searchstring',
};

/**
 * Monta a URL da lista de leilões atuais (§5), ordenada por Start Date (`order_column=101`)
 * e paginada. Só inclui os filtros fornecidos.
 */
export function buildListUrl(filter: ListFilter = {}, page = 1): string {
  const url = new URL(LIST_URL);
  const params = url.searchParams;

  params.set('subtopic', 'currentcharactertrades');
  params.set('order_column', '101'); // Start Date
  // direction=0 = mais novos na página 1 (verificado ao vivo: dir=0 traz os maiores
  // auctionids; dir=1 deixa os chars recém-listados fora da página 1). Crítico p/ §5.
  params.set('order_direction', '0');
  params.set('currentpage', String(page));

  for (const [key, param] of Object.entries(PARAM)) {
    const value = filter[key as keyof ListFilter];
    if (value !== undefined) params.set(param, String(value));
  }

  // §5: searchstring só funciona junto de searchtype.
  if (filter.search !== undefined) params.set('searchtype', filter.searchType ?? '1');

  return url.toString();
}
