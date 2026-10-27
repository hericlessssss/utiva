import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AuctionDetailParseError, parseAuctionDetail } from '../../src/scraper/detail-parser.js';

const fixture = readFileSync(new URL('../fixtures/auction-detail.html', import.meta.url), 'utf8');

describe('parseAuctionDetail', () => {
  const detail = parseAuctionDetail(fixture);

  it('lê os stats gerais (span.LabelV) sem o dois-pontos na chave', () => {
    expect(detail.general['Hit Points']).toBe('2,795');
    expect(detail.general['Mana']).toBe('15,750');
    expect(detail.general['Experience']).toBe('2,454,927,219');
    expect(detail.general['Achievement Points']).toBe('298');
  });

  it('extrai as skills com nível e percentual', () => {
    expect(detail.skills).toHaveLength(8);
    expect(detail.skills).toContainEqual({ name: 'Magic Level', level: 108, percent: 74.72 });
    expect(detail.skills).toContainEqual({ name: 'Axe Fighting', level: 11, percent: 96.66 });
  });

  it('lista os itens com quantidade (prefixo "Nx") e o sprite', () => {
    expect(detail.items).toHaveLength(76);
    expect(detail.items[0]).toEqual({ name: 'document of the follower', count: 1, sprite: '768' });
    expect(detail.items).toContainEqual({ name: 'book', count: 2, sprite: '2825' });
    expect(detail.items.find((i) => i.name === 'backpack')?.count).toBe(56);
  });

  it('lista os imbuements por nome, na ordem da página', () => {
    expect(detail.imbuements).toHaveLength(22);
    expect(detail.imbuements[0]).toBe('Powerful Bash');
    expect(detail.imbuements.at(-1)).toBe('Powerful Void');
  });

  it('lê os charms com nome, tipo e grade', () => {
    expect(detail.charms).toEqual([{ name: 'Wound', type: 'Major', grade: '1' }]);
  });

  it('lista mounts e outfits com nome e sprite', () => {
    expect(detail.mounts).toHaveLength(7);
    expect(detail.mounts).toContainEqual({ name: 'War Bear', count: 1, sprite: '370' });
    expect(detail.outfits).toHaveLength(30);
    expect(detail.outfits).toContainEqual({ name: 'Citizen (base)', count: 1, sprite: '136_0' });
  });
});

describe('parseAuctionDetail — seções opcionais', () => {
  it('seção ausente vira lista vazia (char sem imbuements/charms/mounts é legítimo)', () => {
    const minimal =
      '<div class="CharacterDetailsBlock" id="General">' +
      '<table class="TableContent"><tr class="Even"><td class="LabelColumn"><b>Magic Level</b></td>' +
      '<td class="LevelColumn">1</td><td class="PercentageColumn">' +
      '<span class="PercentageString">0.00 %</span></td></tr></table></div>';
    const detail = parseAuctionDetail(minimal);
    expect(detail.skills).toHaveLength(1);
    expect(detail.items).toEqual([]);
    expect(detail.imbuements).toEqual([]);
    expect(detail.charms).toEqual([]);
    expect(detail.mounts).toEqual([]);
    expect(detail.general).toEqual({});
  });
});

describe('parseAuctionDetail — contrato / quebra de layout', () => {
  it('lança quando o bloco General está ausente (não é página de detalhe)', () => {
    expect(() => parseAuctionDetail('<div class="BoxContent"></div>')).toThrow(AuctionDetailParseError);
  });

  it('lança quando General existe mas não há nenhuma skill (layout quebrou)', () => {
    expect(() => parseAuctionDetail('<div class="CharacterDetailsBlock" id="General"></div>')).toThrow(
      AuctionDetailParseError,
    );
  });
});
