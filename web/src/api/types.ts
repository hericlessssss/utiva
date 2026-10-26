import { API_BASE } from './base';

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
  /** Sprite do outfit exibido no card (stem do GIF); da fase 1 (ADR 10). */
  outfit?: string | null;
  /** Itens que o vendedor escolheu exibir no card; da fase 1. */
  displayItems?: ItemEntry[] | null;
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
  /** Stem do GIF no proxy (ex.: `768`, `136_0`); `null` = sem imagem (cai no texto). */
  sprite: string | null;
}

export type SpriteCategory = 'outfits' | 'mounts' | 'objects';

/** URL do sprite no nosso proxy (ADR 10): `GET /sprites/:cat/:stem.gif`. */
export function spriteUrl(category: SpriteCategory, sprite: string): string {
  return `${API_BASE}/sprites/${category}/${sprite}.gif`;
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
  mounts: ItemEntry[];
  outfits: ItemEntry[];
}

export interface WatchResult {
  auctionId: number;
  enabled: boolean;
}

/** Página de detalhe do leilão no tibia.com (concatenar o auctionid). */
export const AUCTION_DETAIL_URL =
  'https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&page=details&source=overview&auctionid=';
