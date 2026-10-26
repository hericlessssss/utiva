import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CfRenewalError,
  createCfSession,
  createFileCredsStore,
  type CfCreds,
  type FetchPageFn,
} from '../../src/scraper/cf-clearance.js';
import { CloudflareBlockedError } from '../../src/scraper/http-client.js';

/** fetchPage falso: bloqueia (challenge) enquanto o cookie não for `good`; depois devolve body. */
function blockingUntilGood(body = '<html>ok</html>'): FetchPageFn {
  return (url, opts) => {
    if (opts.cfClearance !== 'good') return Promise.reject(new CloudflareBlockedError(url, 4));
    return Promise.resolve(body);
  };
}

const fresh: Required<CfCreds> = { cfClearance: 'good', userAgent: 'UA/2' };

describe('createCfSession', () => {
  it('passa as creds atuais pro fetchPage e devolve o body quando não há bloqueio', async () => {
    const fetchPage = vi.fn<FetchPageFn>(async () => '<html>ok</html>');
    const session = createCfSession({
      renewer: vi.fn(),
      initial: { cfClearance: 'good', userAgent: 'UA/1' },
      fetchPage,
    });

    await expect(session.fetchPage('http://x', {})).resolves.toBe('<html>ok</html>');
    expect(fetchPage).toHaveBeenCalledWith('http://x', { cfClearance: 'good', userAgent: 'UA/1' });
  });

  it('no CloudflareBlockedError: renova (Playwright), aplica o novo cookie e re-tenta uma vez', async () => {
    const renewer = vi.fn(async () => fresh);
    const session = createCfSession({ renewer, initial: {}, fetchPage: blockingUntilGood() });

    await expect(session.fetchPage('http://x', {})).resolves.toBe('<html>ok</html>');
    expect(renewer).toHaveBeenCalledTimes(1);
    expect(session.creds()).toEqual(fresh);
  });

  it('erro que não é do Cloudflare sobe sem renovar', async () => {
    const renewer = vi.fn(async () => fresh);
    const fetchPage: FetchPageFn = () => Promise.reject(new Error('rede caiu'));
    const session = createCfSession({ renewer, fetchPage });

    await expect(session.fetchPage('http://x', {})).rejects.toThrow('rede caiu');
    expect(renewer).not.toHaveBeenCalled();
  });

  it('se continua bloqueado após renovar, lança (não entra em loop)', async () => {
    const renewer = vi.fn(async () => ({ cfClearance: 'still-bad', userAgent: 'UA' }));
    const session = createCfSession({ renewer, fetchPage: blockingUntilGood() });

    await expect(session.fetchPage('http://x', {})).rejects.toBeInstanceOf(CloudflareBlockedError);
    expect(renewer).toHaveBeenCalledTimes(1);
  });

  it('single-flight: dois fetches bloqueados ao mesmo tempo renovam só uma vez', async () => {
    const renewer = vi.fn(async () => fresh);
    const session = createCfSession({ renewer, initial: {}, fetchPage: blockingUntilGood() });

    const [a, b] = await Promise.all([
      session.fetchPage('http://a', {}),
      session.fetchPage('http://b', {}),
    ]);

    expect([a, b]).toEqual(['<html>ok</html>', '<html>ok</html>']);
    expect(renewer).toHaveBeenCalledTimes(1);
  });

  it('renovador que falha vira CfRenewalError (um CloudflareBlockedError, p/ o backfill parar)', async () => {
    const renewer = vi.fn(async () => {
      throw new Error('chromium não subiu');
    });
    const session = createCfSession({ renewer, fetchPage: blockingUntilGood() });

    const err = await session.fetchPage('http://x', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CfRenewalError);
    expect(err).toBeInstanceOf(CloudflareBlockedError);
  });

  it('onRenew que lança não derruba o fetch (cookie já está em memória)', async () => {
    const onRenew = vi.fn(() => {
      throw new Error('disco cheio');
    });
    const session = createCfSession({
      renewer: async () => fresh,
      initial: {},
      fetchPage: blockingUntilGood(),
      onRenew,
    });

    await expect(session.fetchPage('http://x', {})).resolves.toBe('<html>ok</html>');
    expect(session.creds()).toEqual(fresh);
  });

  it('persiste o cookie novo via onRenew', async () => {
    const onRenew = vi.fn();
    const session = createCfSession({
      renewer: async () => fresh,
      initial: {},
      fetchPage: blockingUntilGood(),
      onRenew,
    });

    await session.fetchPage('http://x', {});
    expect(onRenew).toHaveBeenCalledTimes(1);
    expect(onRenew).toHaveBeenCalledWith(fresh);
  });
});

describe('createFileCredsStore', () => {
  it('save/load faz roundtrip e load de arquivo ausente devolve {}', () => {
    const dir = mkdtempSync(join(tmpdir(), 'utiva-cf-'));
    const path = join(dir, 'cf.json');
    try {
      expect(createFileCredsStore(path).load()).toEqual({});
      createFileCredsStore(path).save(fresh);
      expect(createFileCredsStore(path).load()).toEqual(fresh);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(fresh);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
