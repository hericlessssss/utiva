import type { AuctionsApi } from './auctions';
import { ApiError } from './http';
import type { Auction, AuctionDetail, ItemEntry } from './types';

const H = 3_600_000;

// Outfit base por vocação (stem do GIF no proxy) e um showcase de itens de exibição.
const OUTFIT: Record<string, string> = {
  Knight: '139_3',
  Druid: '138_3',
  Paladin: '137_3',
  Sorcerer: '141_3',
  Monk: '1681_3',
};
function outfitFor(vocation: string): string {
  return Object.entries(OUTFIT).find(([k]) => vocation.includes(k))?.[1] ?? '128_0';
}
const DISPLAY_ITEMS: ItemEntry[] = [
  { name: 'boots of haste', count: 1, sprite: '3079' },
  { name: 'magic plate armor', count: 1, sprite: '3366' },
  { name: 'onyx flail', count: 1, sprite: '7421' },
];

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Detalhe (fase 2) fictício para um char knight, pra a tela de detalhe ter o que mostrar no mock. */
function sampleDetail(): AuctionDetail {
  return {
    general: {
      'Hit Points': '9,450',
      Mana: '2,100',
      Capacity: '12,340',
      Speed: '812',
      'Achievement Points': '612',
      Experience: '18,920,004,112',
    },
    skills: [
      { name: 'Magic Level', level: 14, percent: 22.5 },
      { name: 'Axe Fighting', level: 121, percent: 88.3 },
      { name: 'Shielding', level: 118, percent: 4.1 },
      { name: 'Distance Fighting', level: 15, percent: 0 },
    ],
    items: [
      { name: 'falcon longsword', count: 1, sprite: '25383' },
      { name: 'soulcutter', count: 1, sprite: '38935' },
      { name: 'crystal coin', count: 86, sprite: '3043' },
      { name: 'supreme health potion', count: 1200, sprite: '23375' },
    ],
    imbuements: ['Powerful Vampirism', 'Powerful Strike', 'Powerful Void'],
    charms: [
      { name: 'Wound', type: 'Major', grade: '1' },
      { name: 'Dodge', type: 'Minor', grade: '1' },
    ],
    mounts: [
      { name: 'War Bear', count: 1, sprite: '370' },
      { name: 'Gryphon', count: 1, sprite: '389' },
      { name: 'Tamed Panda', count: 1, sprite: '402' },
    ],
    outfits: [
      { name: 'Knight (base)', count: 1, sprite: '139_0' },
      { name: 'Elite Knight (base & addon 1 & addon 2)', count: 1, sprite: '139_3' },
    ],
  };
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
    outfit: outfitFor(vocation),
    displayItems: level >= 300 ? DISPLAY_ITEMS : [], // alguns chars sem showcase (mostra o caso vazio)
    // Só o primeiro char tem detalhe (fase 2) no mock; os outros simulam "ainda não detalhado".
    ...(auctionId === 1874211 ? { attributes: sampleDetail() } : {}),
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
