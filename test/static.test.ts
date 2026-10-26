import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const INDEX = '<!doctype html><title>Utiva</title><div id="root"></div>';

describe('frontend estático (web/dist)', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'utiva-web-'));
    writeFileSync(join(dir, 'index.html'), INDEX);
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    // Caminho relativo ao cwd, como `WEB_DIST=web/dist` no .env: o app precisa resolver.
    app = buildApp({ webDist: relative(process.cwd(), dir) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET / serve o index.html', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toBe(INDEX);
  });

  it('serve os assets do build', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
  });

  it('rota client-side desconhecida com Accept html cai no index (SPA)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/leiloes/123',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(INDEX);
  });

  it('rota desconhecida pedindo JSON continua 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nao-existe',
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST desconhecido continua 404 mesmo aceitando html', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/qualquer',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('a API continua respondendo JSON', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('sem webDist', () => {
  it('GET / é 404 (só API)', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
