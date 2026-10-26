import type { FastifyInstance } from 'fastify';
import type { SpriteStore } from '../sprites/sprite-store.js';

/**
 * Proxy dos sprites do bazar (ADR 10): `GET /sprites/:cat/:file` devolve o GIF/PNG do
 * static.tibia.com (cache em disco no store). Validação e miss viram 404 — o front já cai no
 * texto quando a imagem falha. Cache imutável: o arquivo nunca muda pra um dado id.
 */
export async function spriteRoutes(app: FastifyInstance, opts: { store: SpriteStore }): Promise<void> {
  app.get<{ Params: { cat: string; file: string } }>('/sprites/:cat/:file', async (req, reply) => {
    const img = await opts.store.get(req.params.cat, req.params.file);
    if (!img) return reply.code(404).send({ error: 'sprite não encontrado' });
    return reply
      .header('content-type', img.contentType)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(img.body);
  });
}
