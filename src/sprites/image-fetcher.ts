import type { CfCreds } from '../scraper/cf-clearance.js';
import { DEFAULT_UA } from '../scraper/http-client.js';
import type { ImageFetcher } from './sprite-store.js';

const TIMEOUT_MS = 15_000;

/**
 * `ImageFetcher` de produção: baixa o sprite do static.tibia.com com as creds da sessão cf
 * (ADR 10). O `cf_clearance` é escopo `.tibia.com`, então vale pro subdomínio static; o UA
 * precisa casar o que obteve o cookie (o Cloudflare amarra cookie+UA). `creds` é uma função
 * porque o cookie pode ser renovado em runtime — lemos o valor atual a cada request.
 */
export function tibiaImageFetcher(creds: () => CfCreds): ImageFetcher {
  return async (url) => {
    const c = creds();
    const headers: Record<string, string> = {
      'user-agent': c.userAgent ?? DEFAULT_UA,
      accept: 'image/avif,image/webp,image/gif,image/png,*/*',
    };
    if (c.cfClearance) headers.cookie = `cf_clearance=${c.cfClearance}`;

    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      statusCode: res.status,
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? undefined,
    };
  };
}
