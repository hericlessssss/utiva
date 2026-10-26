import type { AuctionsApi } from './auctions';
import { ApiError } from './http';
import type { Auction } from './types';

const H = 3_600_000;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Leilões fictícios com nomes inventados; estrutura igual à do backend. */
function seed(): Auction[] {
  const rows: Array<[number, string, string, string, string, number, number, number | null, 'current' | 'min', boolean]> = [
    [1874211, 'Varkos Thunderhide', 'Antica', 'Elite Knight', 'male', 612, 18 * H + 25 * 60_000, 9500, 'current', true],
    [1874207, 'Lirael Moonwhisper', 'Secura', 'Elder Druid', 'female', 438, 42 * 60_000, 3100, 'current', true],
    [1874196, 'Brann Ironfist', 'Harmonia', 'Royal Paladin', 'male', 287, 2 * 24 * H + 5 * H, 1200, 'min', false],
    [1874188, 'Sorin Ashveil', 'Celesta', 'Master Sorcerer', 'male', 923, 3 * H + 12 * 60_000, 42000, 'current', false],
    [1874170, 'Tessa Quillfeather', 'Nefera', 'Exalted Monk', 'female', 155, 6 * 24 * H, 600, 'min', false],
    [1874161, 'Ulric Stonebrow', 'Antica', 'Elite Knight', 'male', 341, 14 * 60_000, 2800, 'current', false],
    [1874133, 'Mireille Dusk', 'Wintera', 'Elder Druid', 'female', 509, 1 * 24 * H + 2 * H, 7700, 'current', false],
    [1874102, 'Hadrik Veldt', 'Quintera', 'Royal Paladin', 'male', 702, -2 * H, 15000, 'current', false],
  ];
  return rows.map(([auctionId, charName, world, vocation, sex, level, endsIn, bid, kind, watched]) => ({
    auctionId,
    charName,
    world,
    vocation,
    sex,
    level,
    startAt: iso(endsIn - 7 * 24 * H),
    endAt: iso(endsIn),
    minBid: kind === 'min' ? bid : null,
    currentBid: kind === 'current' ? bid : null,
    battleye: 'protected',
    pvpType: world === 'Antica' ? 'Open PvP' : 'Optional PvP',
    status: endsIn > 0 ? 'active' : 'finished',
    firstSeenAt: iso(-(1874211 - auctionId) * 60_000),
    lastSeenAt: iso(-60_000),
    ...(watched ? { watched: { enabled: true } } : {}),
  }));
}

export function createMockAuctions(): AuctionsApi {
  const data = seed();
  const find = (id: number) => {
    const found = data.find((a) => a.auctionId === id);
    if (!found) throw new ApiError(404, 'leilão não encontrado');
    return found;
  };
  return {
    list: async () => data.map((a) => ({ ...a })),
    detail: async (id) => ({ ...find(id) }),
    setWatched: async (id, enabled) => {
      find(id).watched = { enabled };
      return { auctionId: id, enabled };
    },
  };
}
