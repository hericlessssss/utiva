import { describe, expect, it, vi } from 'vitest';
import {
  CloudflareBlockedError,
  fetchPage,
  type Fetcher,
  type PageResponse,
} from '../../src/scraper/http-client.js';

function responder(responses: PageResponse[]) {
  const headersSeen: Record<string, string>[] = [];
  let i = 0;
  const fetcher: Fetcher = (_url, headers) => {
    headersSeen.push(headers);
    const res = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return Promise.resolve(res);
  };
  return {
    fetcher,
    headersSeen,
    get calls() {
      return i;
    },
  };
}

const ok = (body = '<html>ok</html>'): PageResponse => ({ statusCode: 200, body });
const status = (statusCode: number): PageResponse => ({ statusCode, body: '' });

const opts = (fetcher: Fetcher, extra = {}) => ({
  fetcher,
  sleep: vi.fn(() => Promise.resolve()),
  ...extra,
});

describe('fetchPage', () => {
  it('devolve o body em 200 limpo', async () => {
    const q = responder([ok('<html>página</html>')]);

    await expect(fetchPage('http://x', opts(q.fetcher))).resolves.toBe('<html>página</html>');
    expect(q.calls).toBe(1);
  });

  it('envia cf_clearance como cookie e um user-agent', async () => {
    const q = responder([ok()]);

    await fetchPage('http://x', opts(q.fetcher, { cfClearance: 'abc123', userAgent: 'UA/1' }));

    expect(q.headersSeen[0]!.cookie).toContain('cf_clearance=abc123');
    expect(q.headersSeen[0]!['user-agent']).toBe('UA/1');
  });

  it('faz backoff e tenta de novo após um 403', async () => {
    const q = responder([status(403), ok()]);
    const o = opts(q.fetcher);

    await expect(fetchPage('http://x', o)).resolves.toBe('<html>ok</html>');
    expect(q.calls).toBe(2);
    expect(o.sleep).toHaveBeenCalledTimes(1);
  });

  it('também faz retry em 429/503 (throttle transitório)', async () => {
    const q = responder([status(429), status(503), ok()]);

    await expect(fetchPage('http://x', opts(q.fetcher))).resolves.toBe('<html>ok</html>');
    expect(q.calls).toBe(3);
  });

  it('trata 200 com corpo de challenge do Cloudflare como bloqueio e tenta de novo', async () => {
    const q = responder([ok('<html><body>Just a moment...</body></html>'), ok('<html>real</html>')]);

    await expect(fetchPage('http://x', opts(q.fetcher))).resolves.toBe('<html>real</html>');
    expect(q.calls).toBe(2);
  });

  it('lança CloudflareBlockedError após esgotar retries em 403', async () => {
    const q = responder([status(403)]);
    const o = opts(q.fetcher, { maxRetries: 2 });

    await expect(fetchPage('http://x', o)).rejects.toBeInstanceOf(CloudflareBlockedError);
    expect(q.calls).toBe(3);
    expect(o.sleep).toHaveBeenCalledTimes(2);
  });

  it('lança CloudflareBlockedError após esgotar retries em challenge-200', async () => {
    const q = responder([ok('<html>cf-browser-verification</html>')]);

    await expect(
      fetchPage('http://x', opts(q.fetcher, { maxRetries: 1 })),
    ).rejects.toBeInstanceOf(CloudflareBlockedError);
  });

  it('esgotar retries em 503 lança erro transitório (não CloudflareBlockedError)', async () => {
    const q = responder([status(503)]);
    const o = opts(q.fetcher, { maxRetries: 1 });

    await expect(fetchPage('http://x', o)).rejects.not.toBeInstanceOf(CloudflareBlockedError);
    expect(q.calls).toBe(2);
  });

  it('lança erro genérico (sem retry) para status não-retryável', async () => {
    const q = responder([status(404)]);

    await expect(fetchPage('http://x', opts(q.fetcher))).rejects.not.toBeInstanceOf(
      CloudflareBlockedError,
    );
    expect(q.calls).toBe(1);
  });
});
