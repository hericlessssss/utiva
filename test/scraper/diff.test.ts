import { describe, expect, it } from 'vitest';
import { diffNewAuctions } from '../../src/scraper/diff.js';
import type { AuctionListEntry } from '../../src/scraper/list-parser.js';

function entry(auctionId: number): AuctionListEntry {
  return {
    auctionId,
    characterName: `char-${auctionId}`,
    level: 1,
    vocation: 'Knight',
    sex: 'Male',
    world: 'Antica',
    endsAt: new Date(0),
    bid: { amount: 0, kind: 'current' },
  };
}

describe('diffNewAuctions', () => {
  const entries = [entry(1), entry(2), entry(3)];

  it('devolve todos quando nada foi visto', () => {
    expect(diffNewAuctions([], entries).map((e) => e.auctionId)).toEqual([1, 2, 3]);
  });

  it('devolve [] quando todos já foram vistos', () => {
    expect(diffNewAuctions([1, 2, 3], entries)).toEqual([]);
  });

  it('devolve só os novos, preservando a ordem da página', () => {
    expect(diffNewAuctions([2], entries).map((e) => e.auctionId)).toEqual([1, 3]);
  });

  it('aceita um Set como ids vistos', () => {
    expect(diffNewAuctions(new Set([1, 3]), entries).map((e) => e.auctionId)).toEqual([2]);
  });
});
