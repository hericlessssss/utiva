import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './index';

afterEach(() => vi.unstubAllGlobals());

describe('createApi', () => {
  it('forceMock serve leilões sem tocar na rede', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const api = createApi('http://api', true);
    const list = await api.auctions.list();
    expect(list.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
