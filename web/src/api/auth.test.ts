import { describe, expect, it, vi } from 'vitest';
import { createAuthApi } from './auth';
import { ApiError, type Http } from './http';

// `Http` tem métodos genéricos (`get<T>`), que um vi.fn concreto não satisfaz; cast no fim.
function http(over: { get?: () => Promise<unknown>; send?: () => Promise<unknown> }): Http {
  return { get: vi.fn(), send: vi.fn(), ...over } as unknown as Http;
}

describe('authApi', () => {
  it('me devolve o usuário da sessão', async () => {
    const user = { id: 'u1', email: 'a@b.com', name: 'A', picture: null };
    const api = createAuthApi(http({ get: vi.fn(async () => user) }), '');
    expect(await api.me()).toEqual(user);
  });

  it('me devolve null quando não há login (401)', async () => {
    const api = createAuthApi(
      http({
        get: vi.fn(async () => {
          throw new ApiError(401, 'não autenticado');
        }),
      }),
      '',
    );
    expect(await api.me()).toBeNull();
  });

  it('me propaga erros que não sejam 401', async () => {
    const api = createAuthApi(
      http({
        get: vi.fn(async () => {
          throw new ApiError(500, 'boom');
        }),
      }),
      '',
    );
    await expect(api.me()).rejects.toThrow('boom');
  });

  it('logout faz POST /auth/logout', async () => {
    const send = vi.fn(async () => undefined);
    await createAuthApi(http({ send }), '').logout();
    expect(send).toHaveBeenCalledWith('POST', '/auth/logout');
  });

  it('loginUrl monta a URL a partir do baseUrl', () => {
    expect(createAuthApi(http({}), 'http://127.0.0.1:3000').loginUrl()).toBe(
      'http://127.0.0.1:3000/auth/google',
    );
  });
});
