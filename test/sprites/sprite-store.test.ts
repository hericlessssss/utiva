import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpriteStore, spriteSourceUrl } from '../../src/sprites/sprite-store.js';

const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"

describe('createSpriteStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'utiva-sprite-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const ok = () => vi.fn(async () => ({ statusCode: 200, body: GIF, contentType: 'image/gif' }));

  it('rejeita categoria fora da allowlist e nome inválido (sem tocar na rede)', async () => {
    const fetchImage = ok();
    const store = createSpriteStore({ dir, fetchImage });

    expect(await store.get('etc', 'passwd')).toBeNull();
    expect(await store.get('objects', '../../secret')).toBeNull();
    expect(await store.get('objects', '768.exe')).toBeNull();
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('miss: busca na origem, grava no cache e devolve o content-type pela extensão', async () => {
    const fetchImage = ok();
    const store = createSpriteStore({ dir, fetchImage });

    const img = await store.get('outfits', '136_0.gif');
    expect(img).toEqual({ body: GIF, contentType: 'image/gif' });
    expect(fetchImage).toHaveBeenCalledWith(spriteSourceUrl('outfits', '136_0.gif'));
    expect(readFileSync(join(dir, 'outfits', '136_0.gif'))).toEqual(GIF);
  });

  it('hit: na segunda vez lê do cache e não bate na origem', async () => {
    const fetchImage = ok();
    const store = createSpriteStore({ dir, fetchImage });

    await store.get('mounts', '370.gif');
    const again = await store.get('mounts', '370.gif');

    expect(again).toEqual({ body: GIF, contentType: 'image/gif' });
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('origem não-200: devolve null e não cacheia', async () => {
    const fetchImage = vi.fn(async () => ({ statusCode: 403, body: Buffer.from('blocked') }));
    const store = createSpriteStore({ dir, fetchImage });

    expect(await store.get('objects', '768.gif')).toBeNull();
    expect(await store.get('objects', '768.gif')).toBeNull();
    expect(fetchImage).toHaveBeenCalledTimes(2); // nada foi cacheado → tenta de novo no próximo request
  });

  it('200 mas não-imagem (challenge HTML do Cloudflare): null e não cacheia', async () => {
    const fetchImage = vi.fn(async () => ({
      statusCode: 200,
      body: Buffer.from('<html>just a moment…</html>'),
      contentType: 'text/html; charset=UTF-8',
    }));
    const store = createSpriteStore({ dir, fetchImage });

    expect(await store.get('objects', '768.gif')).toBeNull();
    expect(await store.get('objects', '768.gif')).toBeNull();
    expect(fetchImage).toHaveBeenCalledTimes(2); // HTML não foi cacheado como .gif
  });
});
