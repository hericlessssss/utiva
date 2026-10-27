import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { SpriteStore } from '../../src/sprites/sprite-store.js';

const GIF = Buffer.from([0x47, 0x49, 0x46]);

describe('rota de sprites', () => {
  let app: FastifyInstance;
  const get = vi.fn<SpriteStore['get']>(async (cat, file) =>
    cat === 'outfits' && file === '136_0.gif' ? { body: GIF, contentType: 'image/gif' } : null,
  );

  beforeAll(async () => {
    app = buildApp({ spriteStore: { get } });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /sprites/:cat/:file serve a imagem com content-type e cache imutável', async () => {
    const res = await app.inject({ method: 'GET', url: '/sprites/outfits/136_0.gif' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/gif');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.rawPayload).toEqual(GIF);
  });

  it('404 quando o store devolve null (inválido ou indisponível)', async () => {
    const res = await app.inject({ method: 'GET', url: '/sprites/objects/999.gif' });
    expect(res.statusCode).toBe(404);
  });
});
