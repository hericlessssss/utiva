import type { Http } from './http';
import type { WatchFilter, WatchFilterBody } from './types';

export interface FiltersApi {
  list(): Promise<WatchFilter[]>;
  create(body: WatchFilterBody): Promise<WatchFilter>;
  update(id: number, body: WatchFilterBody): Promise<WatchFilter>;
  remove(id: number): Promise<void>;
}

export function createFiltersApi(http: Http): FiltersApi {
  return {
    list: () => http.get('/filters'),
    create: (body) => http.send('POST', '/filters', body),
    update: (id, body) => http.send('PATCH', `/filters/${id}`, body),
    remove: (id) => http.send('DELETE', `/filters/${id}`),
  };
}
