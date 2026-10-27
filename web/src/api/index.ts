import { createAuctionsApi, type AuctionsApi } from './auctions';
import { createAuthApi, type AuthApi } from './auth';
import { API_BASE } from './base';
import { createFiltersApi, type FiltersApi } from './filters';
import { createHttp } from './http';
import { createMockAuctions } from './mock';

export interface Api {
  auctions: AuctionsApi;
  filters: FiltersApi;
  auth: AuthApi;
}

/**
 * `forceMock` (VITE_MOCK_AUCTIONS=true) usa o mock de leilões sem consultar a API —
 * útil com o backend desligado. Sem a flag, o mock só entra se `GET /auctions` der 404.
 */
export function createApi(baseUrl: string, forceMock = false): Api {
  const http = createHttp(baseUrl);
  const mock = createMockAuctions();
  return {
    auctions: forceMock ? mock : createAuctionsApi(http, mock),
    filters: createFiltersApi(http),
    auth: createAuthApi(http, baseUrl),
  };
}

export const api = createApi(API_BASE, import.meta.env.VITE_MOCK_AUCTIONS === 'true');
