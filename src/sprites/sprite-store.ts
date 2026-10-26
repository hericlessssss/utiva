import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Imagem servida pelo proxy: os bytes crus + o content-type. */
export interface SpriteImage {
  body: Buffer;
  contentType: string;
}

export interface ImageResponse {
  statusCode: number;
  body: Buffer;
  /** Content-type da origem — usado pra confirmar que é imagem antes de cachear (anti-challenge). */
  contentType?: string;
}

/** Busca binária injetável (produção = undici com as creds da sessão cf; testes = fake). */
export type ImageFetcher = (url: string) => Promise<ImageResponse>;

export interface SpriteStore {
  /** Bytes do sprite (cache em disco, origem no miss) ou `null` se inválido/indisponível. */
  get(category: string, file: string): Promise<SpriteImage | null>;
}

// As três seções que o detalhe do bazar expõe (ADR 10). Allowlist = trava o path da origem.
const CATEGORIES = new Set(['outfits', 'mounts', 'objects']);
// Só stem alfanumérico + `.gif` (charactertrade é gif-only): barra path traversal e qualquer
// coisa fora de um id de sprite.
const FILE_RE = /^[A-Za-z0-9_-]+\.gif$/;
const CONTENT_TYPE = 'image/gif';

/** URL do sprite no CDN do tibia.com (ADR 10). `category`/`file` já validados pelo chamador. */
export function spriteSourceUrl(category: string, file: string): string {
  return `https://static.tibia.com/images/charactertrade/${category}/${file}`;
}

/**
 * Proxy com cache dos sprites do bazar (ADR 10): o browser não consegue hotlinkar o
 * static.tibia.com (403 — não manda o cf_clearance cross-origin), então servimos daqui. Os
 * arquivos são imutáveis por id, então o primeiro acerto grava em disco e os próximos saem de
 * lá. Categoria e nome passam por allowlist/regex antes de montar a URL ou o path (anti-SSRF /
 * path traversal). Só cacheia resposta que é mesmo imagem (o Cloudflare serve challenge/erro
 * como HTML com status 200, §5 — cachear isso como .gif immutable apodreceria o cache). Fetches
 * concorrentes do mesmo sprite colapsam num só request (single-flight) — dedup e sem corrida de
 * escrita; a concorrência entre sprites diferentes já é limitada pelo browser (cap por origem).
 */
export function createSpriteStore(opts: { dir: string; fetchImage: ImageFetcher }): SpriteStore {
  const inflight = new Map<string, Promise<SpriteImage | null>>();

  async function fetchAndCache(category: string, file: string, path: string): Promise<SpriteImage | null> {
    const res = await opts.fetchImage(spriteSourceUrl(category, file));
    if (res.statusCode !== 200 || !res.contentType?.startsWith('image/')) return null;

    await mkdir(join(opts.dir, category), { recursive: true });
    // tmp único (uuid) + rename: escrita atômica e sem corrida entre dois writes do mesmo id.
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, res.body);
    await rename(tmp, path);
    return { body: res.body, contentType: CONTENT_TYPE };
  }

  return {
    async get(category, file) {
      if (!CATEGORIES.has(category) || !FILE_RE.test(file)) return null;
      const path = join(opts.dir, category, file);

      try {
        return { body: await readFile(path), contentType: CONTENT_TYPE };
      } catch {
        // miss — segue pra origem
      }

      const key = `${category}/${file}`;
      let pending = inflight.get(key);
      if (!pending) {
        pending = fetchAndCache(category, file, path).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      return pending;
    },
  };
}
