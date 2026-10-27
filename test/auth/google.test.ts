import { describe, expect, it, vi } from 'vitest';
import { exchangeCode, type FetchLike } from '../../src/auth/google.js';

const params = {
  code: 'auth-code',
  verifier: 'verifier',
  clientId: 'client-123',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:3000/auth/callback',
};

function fakeFetch(status: number, bodyOut: string): FetchLike {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => bodyOut }));
}

describe('exchangeCode', () => {
  it('posta os campos do fluxo code+PKCE e devolve os tokens', async () => {
    const fetchImpl = fakeFetch(200, JSON.stringify({ id_token: 'idt', access_token: 'at' }));
    const out = await exchangeCode(params, fetchImpl);

    expect(out.id_token).toBe('idt');
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, { body: string }][] } })
      .mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const sent = new URLSearchParams(init.body);
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('code')).toBe('auth-code');
    expect(sent.get('code_verifier')).toBe('verifier');
    expect(sent.get('client_secret')).toBe('secret');
  });

  it('lança quando o Google responde erro', async () => {
    const fetchImpl = fakeFetch(400, '{"error":"invalid_grant"}');
    await expect(exchangeCode(params, fetchImpl)).rejects.toThrow(/invalid_grant/);
  });

  it('lança quando a resposta não traz id_token', async () => {
    const fetchImpl = fakeFetch(200, JSON.stringify({ access_token: 'at' }));
    await expect(exchangeCode(params, fetchImpl)).rejects.toThrow(/sem id_token/);
  });
});
