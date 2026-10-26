export interface WatchFilter {
  id: number;
  world: string | null;
  pvpType: string | null;
  battleye: string | null;
  vocation: string | null;
  levelFrom: number | null;
  levelTo: number | null;
  skillId: string | null;
  skillFrom: number | null;
  skillTo: number | null;
  search: string | null;
  active: boolean;
}

export type WatchFilterBody = Partial<Omit<WatchFilter, 'id'>>;

export type AuctionStatus = 'active' | 'finished' | 'cancelled';

export interface Auction {
  auctionId: number;
  charName: string;
  world: string;
  vocation: string;
  sex: string;
  level: number;
  startAt: string | null;
  endAt: string;
  minBid: number | null;
  currentBid: number | null;
  battleye: string | null;
  pvpType: string | null;
  status: AuctionStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Breakdown da fase 2 (skills/itens/…); ausente/null até o detalhe ser buscado. */
  attributes?: AuctionDetail | null;
  /** Ausente ou null quando nunca foi marcado. */
  watched?: { enabled: boolean } | null;
}

export interface SkillEntry {
  name: string;
  level: number;
  percent: number;
}

export interface ItemEntry {
  name: string;
  count: number;
}

export interface CharmEntry {
  name: string;
  type: string;
  grade: string;
}

/** Espelha `AuctionDetail` do backend (`src/scraper/detail-parser.ts`). */
export interface AuctionDetail {
  general: Record<string, string>;
  skills: SkillEntry[];
  items: ItemEntry[];
  imbuements: string[];
  charms: CharmEntry[];
  mounts: string[];
  outfits: string[];
}

export interface WatchResult {
  auctionId: number;
  enabled: boolean;
}

/** Página de detalhe do leilão no tibia.com (concatenar o auctionid). */
export const AUCTION_DETAIL_URL =
  'https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&page=details&source=overview&auctionid=';
