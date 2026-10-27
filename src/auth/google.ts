import { GOOGLE_TOKEN_ENDPOINT } from './oidc.js';

export interface ExchangeParams {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenResponse {
  id_token: string;
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

/** `fetch` compatível com o global — injetável para testar sem rede. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * Troca o `code` do callback pelo conjunto de tokens no endpoint do Google
 * (Authorization Code + PKCE). Lança se o Google responder erro.
 */
export async function exchangeCode(
  params: ExchangeParams,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.verifier,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
  }).toString();

  const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`troca de código falhou (${res.status}): ${raw}`);
  }

  const json = JSON.parse(raw) as TokenResponse;
  if (!json.id_token) throw new Error('resposta de token sem id_token');
  return json;
}
