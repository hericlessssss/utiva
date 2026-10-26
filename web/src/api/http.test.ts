import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttp } from './http';

function fakeFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe('createHttp', () => {
  it('monta a URL a partir da base e devolve o JSON', async () => {
    const fetchFn = fakeFetch(200, [{ id: 1 }]);
    const http = createHttp('http://api', fetchFn);
    await expect(http.get('/filters')).resolves.toEqual([{ id: 1 }]);
    expect(fetchFn).toHaveBeenCalledWith('http://api/filters', expect.anything());
  });

  it('envia body JSON com o método pedido', async () => {
    const fetchFn = fakeFetch(201, { id: 2 });
    const http = createHttp('http://api', fetchFn);
    await http.send('POST', '/filters', { world: 'Antica' });
    const init = fetchFn.mock.calls[0]?.[1] ?? {};
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"world":"Antica"}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('204 devolve undefined', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    const http = createHttp('http://api', fetchFn);
    await expect(http.send('DELETE', '/filters/1')).resolves.toBeUndefined();
  });

  it('status de erro vira ApiError com status e mensagem do servidor', async () => {
    const fetchFn = fakeFetch(400, { error: 'levelFrom não pode ser maior que levelTo' });
    const http = createHttp('http://api', fetchFn);
    const err = await http.send('POST', '/filters', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe('levelFrom não pode ser maior que levelTo');
  });

  it('erro sem JSON usa o statusText', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 502, statusText: 'Bad Gateway' }));
    const http = createHttp('http://api', fetchFn);
    await expect(http.get('/filters')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });
});
