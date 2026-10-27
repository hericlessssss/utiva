import type { Browser, BrowserContext } from 'playwright';
import type { FetchPageFn } from './cf-clearance.js';

/**
 * Fetch via browser headful (Playwright), não via HTTP puro (§5, ADR revisado out/2026).
 * O Cloudflare passou a barrar o HTTP puro com o managed challenge ("Just a moment") e NÃO
 * emite mais um `cf_clearance` reutilizável nem pro browser — ele só serve a página pro browser
 * confiável. Então a raspagem abre a página num Chromium headful de verdade (sob Xvfb no
 * container) e lê o HTML renderizado; os parsers (list/detail) seguem iguais.
 *
 * Um browser + um context persistentes, reusados entre requests (mantém cookies de sessão e
 * evita o custo de subir browser a cada fetch). Uma página por fetch, fechada no fim. Baixa
 * concorrência continua valendo (o cron não sobrepõe ticks).
 */
export interface BrowserFetcher {
  fetchPage: FetchPageFn;
  /** User-agent real do browser (o Cloudflare amarra fingerprint; útil pra outros fetches). */
  userAgent: () => string | undefined;
  close: () => Promise<void>;
}

export interface BrowserFetcherOptions {
  /** Headful por padrão: o headless vanilla é reprovado no managed challenge do Cloudflare. */
  headless?: boolean;
  /** Timeout por navegação (default 45s — o challenge pode levar alguns segundos). */
  timeoutMs?: number;
}

/** Evasões anti-automação que o Cloudflare inspeciona antes de liberar a página. */
function stealthInit(): void {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime: {} };
}

export function createBrowserFetcher(opts: BrowserFetcherOptions = {}): BrowserFetcher {
  const headless = opts.headless ?? false;
  const timeoutMs = opts.timeoutMs ?? 45_000;

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let ua: string | undefined;
  let starting: Promise<BrowserContext> | null = null;

  async function getContext(): Promise<BrowserContext> {
    if (context) return context;
    starting ??= (async () => {
      const { chromium } = await import('playwright');
      // `--no-sandbox`: o processo roda como `node` dentro do container, sem o sandbox do Chromium.
      browser = await chromium.launch({
        headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1366, height: 768 } });
      await ctx.addInitScript(stealthInit);
      context = ctx;
      return ctx;
    })();
    return starting;
  }

  const fetchPage: FetchPageFn = async (url) => {
    const ctx = await getContext();
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      ua ??= await page.evaluate(() => navigator.userAgent);
      return await page.content();
    } finally {
      await page.close();
    }
  };

  return {
    fetchPage,
    userAgent: () => ua,
    async close() {
      try {
        await browser?.close();
      } finally {
        browser = null;
        context = null;
        starting = null;
      }
    },
  };
}
