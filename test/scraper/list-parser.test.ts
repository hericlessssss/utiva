import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AuctionListParseError, parseAuctionList } from '../../src/scraper/list-parser.js';

const fixture = readFileSync(new URL('../fixtures/list-page-1.html', import.meta.url), 'utf8');

describe('parseAuctionList', () => {
  const entries = parseAuctionList(fixture);

  it('extrai uma entrada por leilão da página', () => {
    expect(entries).toHaveLength(3);
  });

  it('coleta os auctionids na ordem da página', () => {
    expect(entries.map((e) => e.auctionId)).toEqual([2292063, 2292077, 2292089]);
  });

  it('lê o resumo do primeiro card', () => {
    expect(entries[0]).toMatchObject({
      auctionId: 2292063,
      characterName: 'Kord Di',
      level: 562,
      vocation: 'Elite Knight',
      sex: 'Female',
      world: 'Secura',
    });
  });

  it('converte o fim do leilão (data-timestamp epoch) em Date', () => {
    expect(entries[0]!.endsAt.getTime()).toBe(1793034000 * 1000);
  });

  it('distingue lance atual de lance mínimo', () => {
    expect(entries[0]!.bid).toEqual({ amount: 3000, kind: 'current' });
    expect(entries[2]!.bid).toEqual({ amount: 1000, kind: 'minimum' });
  });

  it('captura o sprite do outfit do char (AuctionOutfitImage)', () => {
    expect(entries[0]!.outfit).toBe('1875_3');
    expect(entries[1]!.outfit).toBe('128_0');
  });

  it('coleta os itens de exibição do card (pula os slots vazios)', () => {
    expect(entries[0]!.displayItems).toEqual([]); // "(no item for display selected)"
    expect(entries[1]!.displayItems).toEqual([
      { name: 'boots of haste', count: 1, sprite: '3079' },
      { name: 'magic plate armor', count: 1, sprite: '3366' },
      { name: 'onyx flail', count: 1, sprite: '7421' },
      { name: 'bounty talisman', count: 1, sprite: '51978' },
    ]);
  });

  it('devolve [] para HTML sem nenhum card (lista vazia legítima)', () => {
    expect(parseAuctionList('<div class="BoxContent"></div>')).toEqual([]);
  });

  it('não inclui texto após o link de World no campo world', () => {
    const polluted = fixture.replace('>Secura</a><br>', '>Secura</a> (premium)<br>');

    expect(parseAuctionList(polluted)[0]!.world).toBe('Secura');
  });
});

describe('parseAuctionList — contrato / quebra de layout', () => {
  it('lança AuctionListParseError quando um card existe mas não parseia', () => {
    const brokenCard =
      '<div class="Auction"><div class="AuctionCharacterName">' +
      '<a href="/?auctionid=99">X</a></div></div>';

    expect(() => parseAuctionList(brokenCard)).toThrow(AuctionListParseError);
  });

  it('lança quando o label de lance é desconhecido (ex.: "Winning Bid:")', () => {
    const changedBid = fixture.replace('Current Bid:', 'Winning Bid:');

    expect(() => parseAuctionList(changedBid)).toThrow(AuctionListParseError);
  });
});
