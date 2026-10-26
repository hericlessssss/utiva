export interface PageResponse {
  statusCode: number;
  body: string;
}

/** Abstração de rede injetável — produção usa `fetch` nativo; testes usam um fake. */
export type Fetcher = (url: string, headers: Record<string, string>) => Promise<PageResponse>;

export interface FetchPageOptions {
  cfClearance?: string;
  userAgent?: string;
  maxRetries?: number;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: (attempt: number) => number;
}

/** 403 persistente = challenge do Cloudflare — sinaliza que o `cf_clearance` precisa renovar. */
export class CloudflareBlockedError extends Error {
  constructor(
    readonly url: string,
    readonly attempts: number,
  ) {
    super(`Cloudflare bloqueou ${url} após ${attempts} tentativa(s) (403) — renovar cf_clearance`);
    this.name = 'CloudflareBlockedError';
  }
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Marcadores de uma página de challenge do Cloudflare servida com HTTP 200. */
const CHALLENGE_MARKERS = [
  /just a moment/i,
  /cf-browser-verification/i,
  /challenge-platform/i,
  /__cf_chl/i,
  /cf_chl_opt/i,
];

/** Status transitórios que merecem retry com backoff: 403 (challenge), 429 (throttle), 5xx. */
function isRetryable(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

function looksLikeChallenge(body: string): boolean {
  return CHALLENGE_MARKERS.some((re) => re.test(body));
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** `fetch` nativo do Node (undici por baixo); segue redirects e aborta se travar. */
export const defaultFetcher: Fetcher = async (url, headers) => {
  const res = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  return { statusCode: res.status, body: await res.text() };
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * GET de uma página com reuso de `cf_clearance`, baixa concorrência e backoff (§5).
 * Faz retry em 403/429/503 e em 200 com corpo de challenge do Cloudflare. Esgotados os
 * retries: se foi challenge/403, lança `CloudflareBlockedError` (renovar cookie); senão,
 * erro transitório. Status não-retryável lança erro genérico sem retry.
 */
export async function fetchPage(url: string, opts: FetchPageOptions = {}): Promise<string> {
  const {
    cfClearance,
    userAgent = DEFAULT_UA,
    maxRetries = 3,
    fetcher = defaultFetcher,
    sleep = realSleep,
    backoffMs = (attempt) => 1000 * 2 ** attempt,
  } = opts;

  const headers: Record<string, string> = {
    'user-agent': userAgent,
    accept: 'text/html',
  };
  if (cfClearance) headers.cookie = `cf_clearance=${cfClearance}`;

  // Reflete só a ÚLTIMA tentativa: um 403 inicial não deve mascarar um 429/503 final.
  let lastWasChallenge = false;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));

    const res = await fetcher(url, headers);
    lastStatus = res.statusCode;

    if (res.statusCode === 200) {
      if (!looksLikeChallenge(res.body)) return res.body;
      lastWasChallenge = true; // 200 mas challenge → trata como bloqueio e tenta de novo
      continue;
    }
    if (!isRetryable(res.statusCode)) {
      throw new Error(`GET ${url} falhou: HTTP ${res.statusCode}`);
    }
    lastWasChallenge = res.statusCode === 403; // 429/5xx = throttle/hiccup, não challenge
  }

  if (lastWasChallenge) throw new CloudflareBlockedError(url, maxRetries + 1);
  throw new Error(`GET ${url} falhou após ${maxRetries + 1} tentativa(s): HTTP ${lastStatus}`);
}
