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
  /** Ausente ou null quando nunca foi marcado. */
  watched?: { enabled: boolean } | null;
}

export interface WatchResult {
  auctionId: number;
  enabled: boolean;
}

export const AUCTION_DETAIL_URL =
  'https://www.tibia.com/charactertrade/?subtopic=auctiondetails&auctionid=';
