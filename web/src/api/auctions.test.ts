import { describe, expect, it, vi } from 'vitest';
import { createAuctionsApi } from './auctions';
import { ApiError, type Http } from './http';
import { createMockAuctions } from './mock';

function notFound(): Http {
  return {
    get: vi.fn(async () => {
      throw new ApiError(404, 'Not Found');
    }),
    send: vi.fn(),
  };
}

describe('createAuctionsApi', () => {
  it('usa a API quando GET /auctions existe', async () => {
    const list = [{ auctionId: 1 }];
    const http: Http = { get: vi.fn(async () => list) as Http['get'], send: vi.fn() };
    const api = createAuctionsApi(http, createMockAuctions());
    await expect(api.list()).resolves.toBe(list);
  });

  it('cai no mock quando GET /auctions responde 404 e fica nele', async () => {
    const http = notFound();
    const api = createAuctionsApi(http, createMockAuctions());

    const list = await api.list();
    expect(list.length).toBeGreaterThan(0);
    await api.detail(list[0]!.auctionId);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('deep link no detalhe também cai no mock quando a lista não existe', async () => {
    const http = notFound();
    const api = createAuctionsApi(http, createMockAuctions());
    const detail = await api.detail(1874207);
    expect(detail.charName).toBe('Lirael Moonwhisper');
    expect(http.get).toHaveBeenCalledTimes(2); // detalhe real (404) + sonda da lista (404)
    await api.detail(1874207);
    expect(http.get).toHaveBeenCalledTimes(2); // já decidido: não consulta mais a API
  });

  it('detalhe 404 com a lista existindo é 404 de verdade', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/auctions') return [];
      throw new ApiError(404, 'leilão não encontrado');
    });
    const api = createAuctionsApi({ get: get as Http['get'], send: vi.fn() }, createMockAuctions());
    await expect(api.detail(1874207)).rejects.toMatchObject({ status: 404 });
  });

  it('outros erros sobem', async () => {
    const http: Http = {
      get: vi.fn(async () => {
        throw new ApiError(500, 'boom');
      }),
      send: vi.fn(),
    };
    const api = createAuctionsApi(http, createMockAuctions());
    await expect(api.list()).rejects.toThrow('boom');
  });

  it('toggle no mock persiste no detalhe', async () => {
    const api = createAuctionsApi(notFound(), createMockAuctions());
    const [first] = await api.list();
    await expect(api.setWatched(first!.auctionId, true)).resolves.toEqual({
      auctionId: first!.auctionId,
      enabled: true,
    });
    const detail = await api.detail(first!.auctionId);
    expect(detail.watched).toEqual({ enabled: true });
  });

  it('detalhe inexistente no mock é 404', async () => {
    const api = createAuctionsApi(notFound(), createMockAuctions());
    await api.list();
    await expect(api.detail(999_999)).rejects.toMatchObject({ status: 404 });
  });
});
