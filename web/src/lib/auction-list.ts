import type { Auction } from '../api/types';

export type SortKey = 'recent' | 'ending' | 'level' | 'bid';

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Mais recentes',
  ending: 'Fim mais próximo',
  level: 'Level',
  bid: 'Lance',
};

export interface ListFilter {
  world: string;
  vocation: string;
  watchedOnly: boolean;
}

export function bidOf(a: Auction): number | null {
  return a.currentBid ?? a.minBid;
}

const COMPARE: Record<SortKey, (x: Auction, y: Auction) => number> = {
  recent: (x, y) => Date.parse(y.firstSeenAt) - Date.parse(x.firstSeenAt),
  ending: (x, y) => Date.parse(x.endAt) - Date.parse(y.endAt),
  level: (x, y) => y.level - x.level,
  bid: (x, y) => (bidOf(y) ?? -1) - (bidOf(x) ?? -1),
};

export function sortAuctions(list: Auction[], key: SortKey): Auction[] {
  return [...list].sort(COMPARE[key]);
}

export function filterAuctions(list: Auction[], f: ListFilter): Auction[] {
  return list.filter(
    (a) =>
      (f.world === '' || a.world === f.world) &&
      (f.vocation === '' || a.vocation === f.vocation) &&
      (!f.watchedOnly || a.watched?.enabled === true),
  );
}

const gold = new Intl.NumberFormat('pt-BR');

export function formatGold(n: number | null): string {
  return n == null ? '—' : gold.format(n);
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function formatDate(iso: string | null): string {
  return iso == null ? '—' : dateTime.format(new Date(iso));
}
