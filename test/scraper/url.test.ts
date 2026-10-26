import { describe, expect, it } from 'vitest';
import { buildListUrl } from '../../src/scraper/url.js';

describe('buildListUrl', () => {
  it('monta a URL base da lista (página 1, ordenada por Start Date)', () => {
    const url = new URL(buildListUrl());

    expect(url.origin + url.pathname).toBe('https://www.tibia.com/charactertrade/');
    expect(url.searchParams.get('subtopic')).toBe('currentcharactertrades');
    expect(url.searchParams.get('order_column')).toBe('101');
    expect(url.searchParams.get('order_direction')).toBe('1');
    expect(url.searchParams.get('currentpage')).toBe('1');
  });

  it('inclui os filtros fornecidos e omite os ausentes', () => {
    const url = new URL(
      buildListUrl({ world: 'Antica', levelFrom: 100, levelTo: 500, profession: '4' }),
    );

    expect(url.searchParams.get('filter_world')).toBe('Antica');
    expect(url.searchParams.get('filter_levelrangefrom')).toBe('100');
    expect(url.searchParams.get('filter_levelrangeto')).toBe('500');
    expect(url.searchParams.get('filter_profession')).toBe('4');
    expect(url.searchParams.has('filter_skillid')).toBe(false);
  });

  it('aceita página explícita', () => {
    expect(new URL(buildListUrl({}, 3)).searchParams.get('currentpage')).toBe('3');
  });

  it('ao buscar, emite searchstring E searchtype (§5 exige os dois)', () => {
    const url = new URL(buildListUrl({ search: 'boots of haste' }));

    expect(url.searchParams.get('searchstring')).toBe('boots of haste');
    expect(url.searchParams.get('searchtype')).toBe('1');
  });

  it('não emite searchtype quando não há busca', () => {
    expect(new URL(buildListUrl({ world: 'Antica' })).searchParams.has('searchtype')).toBe(false);
  });
});
