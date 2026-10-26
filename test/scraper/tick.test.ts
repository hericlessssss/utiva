import { describe, expect, it } from 'vitest';
import { watchFilterToListFilter } from '../../src/scraper/tick.js';

describe('watchFilterToListFilter', () => {
  it('mapeia os campos do watch_filter para os filtros da URL, ignorando nulos', () => {
    const listFilter = watchFilterToListFilter({
      world: 'Antica',
      pvpType: null,
      battleye: null,
      vocation: '4',
      levelFrom: 100,
      levelTo: null,
      skillId: null,
      skillFrom: null,
      skillTo: null,
      search: null,
    });

    expect(listFilter).toEqual({ world: 'Antica', profession: '4', levelFrom: 100 });
  });
});
