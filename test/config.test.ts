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
    expect(cfg.host).toBe('0.0.0.0');
    expect(cfg.port).toBe(3000);
    expect(cfg.scrapeCron).toBe('*/5 * * * *');
    expect(cfg.cfClearance).toBeUndefined();
  });

  it('respeita overrides opcionais', () => {
    const cfg = loadConfig({ ...base, PORT: '8080', SCRAPE_CRON: '*/2 * * * *', CF_CLEARANCE: 'abc' });

    expect(cfg.port).toBe(8080);
    expect(cfg.scrapeCron).toBe('*/2 * * * *');
    expect(cfg.cfClearance).toBe('abc');
  });

  it('lança quando falta uma env obrigatória', () => {
    const withoutKey = {
      DATABASE_URL: base.DATABASE_URL,
      MAIL_FROM: base.MAIL_FROM,
      MAIL_TO: base.MAIL_TO,
    };

    expect(() => loadConfig(withoutKey)).toThrow(/RESEND_API_KEY/);
  });
});
