import { ApiError, type Http } from './http';
import type { Auction, WatchResult } from './types';

export interface AuctionsApi {
  list(): Promise<Auction[]>;
  detail(id: number): Promise<Auction>;
  setWatched(id: number, enabled: boolean): Promise<WatchResult>;
}

function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/**
 * Enquanto `GET /auctions` responder 404 (rota ainda não existe no backend), tudo de
 * leilão (lista, detalhe, toggle) passa a vir do mock em memória. A decisão é tomada
 * uma vez: na primeira lista, ou, num deep link, sondando a lista após um 404 do
 * detalhe. Para remover o mock: apague `mock.ts` e passe só `real`.
 */
export function createAuctionsApi(http: Http, mock: AuctionsApi): AuctionsApi {
  const real: AuctionsApi = {
    list: () => http.get('/auctions'),
    detail: (id) => http.get(`/auctions/${id}`),
    setWatched: (id, enabled) => http.send('PUT', `/auctions/${id}/watch`, { enabled }),
  };
  let active = real;

  /** Após um 404 da API ainda não decidida: troca pro mock se a lista também não existir. */
  async function fallback<T>(err: unknown, retry: () => Promise<T>): Promise<T> {
    if (active !== real || !isNotFound(err)) throw err;
    const probe = await real.list().then(
      () => false,
      (probeErr: unknown) => isNotFound(probeErr),
    );
    if (!probe) throw err;
    active = mock;
    return retry();
  }

  return {
    async list() {
      try {
        return await active.list();
      } catch (err) {
        if (active === real && isNotFound(err)) {
          active = mock;
          return mock.list();
        }
        throw err;
      }
    },
    async detail(id) {
      try {
        return await active.detail(id);
      } catch (err) {
        return fallback(err, () => mock.detail(id));
      }
    },
    async setWatched(id, enabled) {
      try {
        return await active.setWatched(id, enabled);
      } catch (err) {
        return fallback(err, () => mock.setWatched(id, enabled));
      }
    },
  };
}
