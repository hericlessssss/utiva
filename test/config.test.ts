import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/utiva',
  RESEND_API_KEY: 're_123',
  MAIL_FROM: 'bot@utiva.gg',
  MAIL_TO: 'me@x.com',
};

describe('loadConfig', () => {
  it('lê os campos obrigatórios e aplica defaults', () => {
    const cfg = loadConfig(base);

    expect(cfg.databaseUrl).toBe(base.DATABASE_URL);
    expect(cfg.resend).toEqual({ apiKey: 're_123', from: 'bot@utiva.gg', to: 'me@x.com' });
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(3000);
    expect(cfg.scrapeCron).toBe('*/5 * * * *');
    expect(cfg.cfClearance).toBeUndefined();
    expect(cfg.webDist).toBeUndefined();
  });

  it('respeita overrides opcionais', () => {
    const cfg = loadConfig({
      ...base,
      PORT: '8080',
      SCRAPE_CRON: '*/2 * * * *',
      CF_CLEARANCE: 'abc',
      WEB_DIST: ' /app/web/dist ',
    });

    expect(cfg.port).toBe(8080);
    expect(cfg.scrapeCron).toBe('*/2 * * * *');
    expect(cfg.cfClearance).toBe('abc');
    expect(cfg.webDist).toBe('/app/web/dist');
  });

  it('lança quando falta uma env obrigatória', () => {
    const withoutKey = {
      DATABASE_URL: base.DATABASE_URL,
      MAIL_FROM: base.MAIL_FROM,
      MAIL_TO: base.MAIL_TO,
    };

    expect(() => loadConfig(withoutKey)).toThrow(/RESEND_API_KEY/);
  });

  it('sem GOOGLE_CLIENT_ID, auth fica desligado', () => {
    expect(loadConfig(base).auth).toBeUndefined();
  });

  it('com GOOGLE_CLIENT_ID, monta auth com defaults', () => {
    const cfg = loadConfig({
      ...base,
      GOOGLE_CLIENT_ID: 'client-123',
      GOOGLE_CLIENT_SECRET: 'secret',
      COOKIE_SECRET: 'cookie-secret',
    });

    expect(cfg.auth).toEqual({
      googleClientId: 'client-123',
      googleClientSecret: 'secret',
      redirectUri: 'http://localhost:3000/auth/callback',
      cookieSecret: 'cookie-secret',
      postLoginRedirect: '/',
      secureCookies: false,
    });
  });

  it('redirect https liga cookies Secure', () => {
    const cfg = loadConfig({
      ...base,
      GOOGLE_CLIENT_ID: 'client-123',
      GOOGLE_CLIENT_SECRET: 'secret',
      COOKIE_SECRET: 'cookie-secret',
      OAUTH_REDIRECT_URI: 'https://utiva.gg/auth/callback',
    });

    expect(cfg.auth?.secureCookies).toBe(true);
    expect(cfg.auth?.redirectUri).toBe('https://utiva.gg/auth/callback');
  });

  it('com GOOGLE_CLIENT_ID mas sem COOKIE_SECRET, lança', () => {
    expect(() =>
      loadConfig({ ...base, GOOGLE_CLIENT_ID: 'client-123', GOOGLE_CLIENT_SECRET: 'secret' }),
    ).toThrow(/COOKIE_SECRET/);
  });
});
