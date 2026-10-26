import { describe, expect, it } from 'vitest';
import type { Auction } from '../api/types';
import { filterAuctions, formatGold, sortAuctions } from './auction-list';

function auction(partial: Partial<Auction> & { auctionId: number }): Auction {
  return {
    charName: 'X',
    world: 'Antica',
    vocation: 'Elite Knight',
    sex: 'male',
    level: 100,
    startAt: null,
    endAt: '2026-10-27T00:00:00Z',
    minBid: null,
    currentBid: null,
    battleye: null,
    pvpType: null,
    status: 'active',
    firstSeenAt: '2026-10-26T00:00:00Z',
    lastSeenAt: '2026-10-26T00:00:00Z',
    ...partial,
  };
}

const a = auction({ auctionId: 1, level: 300, currentBid: 500, firstSeenAt: '2026-10-26T10:00:00Z', endAt: '2026-10-28T00:00:00Z' });
const b = auction({ auctionId: 2, level: 100, minBid: 900, firstSeenAt: '2026-10-26T12:00:00Z', endAt: '2026-10-27T00:00:00Z', world: 'Secura', watched: { enabled: true } });
const c = auction({ auctionId: 3, level: 200, firstSeenAt: '2026-10-26T11:00:00Z', endAt: '2026-10-29T00:00:00Z', vocation: 'Elder Druid' });

describe('sortAuctions', () => {
  it('recentes: firstSeenAt desc', () => {
    expect(sortAuctions([a, b, c], 'recent').map((x) => x.auctionId)).toEqual([2, 3, 1]);
  });
  it('fim: endAt asc', () => {
    expect(sortAuctions([a, b, c], 'ending').map((x) => x.auctionId)).toEqual([2, 1, 3]);
  });
  it('level desc', () => {
    expect(sortAuctions([a, b, c], 'level').map((x) => x.auctionId)).toEqual([1, 3, 2]);
  });
  it('lance desc usa currentBid ou minBid; sem lance vai pro fim', () => {
    expect(sortAuctions([a, b, c], 'bid').map((x) => x.auctionId)).toEqual([2, 1, 3]);
  });
  it('não muta a entrada', () => {
    const input = [a, b, c];
    sortAuctions(input, 'level');
    expect(input.map((x) => x.auctionId)).toEqual([1, 2, 3]);
  });
});

describe('filterAuctions', () => {
  it('por mundo, vocação e acompanhados', () => {
    expect(filterAuctions([a, b, c], { world: 'Antica', vocation: '', watchedOnly: false })).toEqual([a, c]);
    expect(filterAuctions([a, b, c], { world: '', vocation: 'Elder Druid', watchedOnly: false })).toEqual([c]);
    expect(filterAuctions([a, b, c], { world: '', vocation: '', watchedOnly: true })).toEqual([b]);
  });
});

describe('formatGold', () => {
  it('separa milhares em pt-BR', () => {
    expect(formatGold(9500)).toBe('9.500');
    expect(formatGold(null)).toBe('—');
  });
});
