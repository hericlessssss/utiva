import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  CloudflareBlockedError,
  fetchPage as realFetchPage,
  type FetchPageOptions,
} from './http-client.js';

/**
 * A renovação do cf_clearance falhou (Playwright não subiu, challenge não resolveu, etc.).
 * Estende `CloudflareBlockedError` de propósito: pro chamador (ex.: `runDetailBackfill`) é só
 * "continuamos bloqueados e não deu pra recuperar", então o mesmo `break` do bloqueio vale —
 * sem relançar o browser id após id no mesmo ciclo.
 */
export class CfRenewalError extends CloudflareBlockedError {
  constructor(url: string, cause: unknown) {
    super(url, 0);
    this.name = 'CfRenewalError';
    this.message = `falha ao renovar cf_clearance para ${url}: ${String(cause)}`;
    this.cause = cause;
  }
}

/** Credenciais que o Cloudflare amarra juntas: o cookie e o user-agent que o obteve. */
export interface CfCreds {
  cfClearance?: string;
  userAgent?: string;
}

/** Renova o `cf_clearance` (via browser) e devolve o cookie + o UA usado pra obtê-lo. */
export type CfRenewer = () => Promise<Required<CfCreds>>;

export type FetchPageFn = (url: string, opts: FetchPageOptions) => Promise<string>;

export interface CfSessionOptions {
  renewer: CfRenewer;
  /** Cookie/UA iniciais (do env ou do store); vazio força renovar no primeiro bloqueio. */
  initial?: CfCreds;
  /** Chamado uma vez por renovação, pra persistir o cookie novo (ex.: gravar em arquivo). */
  onRenew?: (creds: Required<CfCreds>) => void | Promise<void>;
  /** Injeção do fetchPage real (default) — nos testes, um fake. */
  fetchPage?: FetchPageFn;
}

export interface CfSession {
  /** fetchPage com as creds atuais; no `CloudflareBlockedError`, renova (1×) e re-tenta uma vez. */
  fetchPage: FetchPageFn;
  creds: () => CfCreds;
}

/**
 * Sessão que reusa o `cf_clearance` entre requests e, quando o Cloudflare bloqueia de vez
 * (`CloudflareBlockedError`), renova o cookie pelo `renewer` (Playwright, §3/§5) e re-tenta
 * UMA vez. A renovação é single-flight: vários fetches bloqueados ao mesmo tempo disparam um
 * único renew. Re-tentar só uma vez evita loop se o cookie novo também não passar.
 */
export function createCfSession(opts: CfSessionOptions): CfSession {
  const fetchPage = opts.fetchPage ?? realFetchPage;
  let creds: CfCreds = opts.initial ?? {};
  let renewing: Promise<void> | null = null;

  function renew(): Promise<void> {
    renewing ??= opts.renewer()
      .then(async (fresh) => {
        creds = fresh;
        // Persistir é best-effort: o cookie já está em memória e o fetch deve seguir mesmo
        // se gravar no disco falhar (senão uma renovação boa viraria um fetch quebrado).
        try {
          await opts.onRenew?.(fresh);
        } catch (persistErr) {
          console.error('[cf] falha ao persistir o cookie renovado (segue em memória):', persistErr);
        }
      })
      .finally(() => {
        renewing = null;
      });
    return renewing;
  }

  async function fetch(url: string, extra: FetchPageOptions): Promise<string> {
    try {
      return await fetchPage(url, { ...extra, ...creds });
    } catch (err) {
      if (!(err instanceof CloudflareBlockedError)) throw err;
      try {
        await renew();
      } catch (renewErr) {
        throw new CfRenewalError(url, renewErr); // renovação falhou → sinaliza bloqueio ao chamador
      }
      return fetchPage(url, { ...extra, ...creds }); // re-tenta uma vez com o cookie novo
    }
  }

  return { fetchPage: fetch, creds: () => creds };
}

export interface PlaywrightRenewOptions {
  /** URL que dispara o challenge (a própria lista do bazar serve). */
  url: string;
  headless?: boolean;
  timeoutMs?: number;
}

/**
 * Renovador real (§3/§5): abre o Chromium (Playwright), carrega a página, deixa o Cloudflare
 * resolver o challenge e setar o `cf_clearance`, e devolve o cookie + o UA do browser (o cookie
 * é amarrado ao UA/IP, então os requests HTTP seguintes PRECISAM mandar o mesmo UA). O
 * `playwright` é importado dinamicamente pra não ser carregado quando o fallback nunca dispara.
 */
export function playwrightRenewer(opts: PlaywrightRenewOptions): CfRenewer {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: opts.headless ?? true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      // O challenge seta o cookie ao passar; espera ele aparecer (polling curto).
      const deadline = Date.now() + timeoutMs;
      let cfClearance: string | undefined;
      while (Date.now() < deadline) {
        cfClearance = (await context.cookies()).find((c) => c.name === 'cf_clearance')?.value;
        if (cfClearance) break;
        await page.waitForTimeout(1000);
      }
      if (!cfClearance) throw new Error('cf_clearance não apareceu após o desafio do Cloudflare');

      const userAgent = await page.evaluate(() => navigator.userAgent);
      return { cfClearance, userAgent };
    } finally {
      await browser.close();
    }
  };
}

/** Store simples em arquivo JSON pro cookie sobreviver a restarts (§5: reusar o cf_clearance). */
export function createFileCredsStore(path: string): {
  load: () => CfCreds;
  save: (creds: CfCreds) => void;
} {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as CfCreds;
      } catch {
        return {};
      }
    },
    save(creds) {
      // Escrita atômica (tmp + rename): um crash no meio não deixa o JSON truncado, o que
      // na próxima subida derrubaria o parse e perderia o cookie válido.
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(creds));
      renameSync(tmp, path);
    },
  };
}
