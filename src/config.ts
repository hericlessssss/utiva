import { resolvePort } from './env.js';

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  resend: { apiKey: string; from: string; to: string };
  cfClearance?: string;
  scrapeCron: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  return value;
}

/** Lê e valida a config da aplicação a partir do ambiente (falha rápido se faltar algo). */
export function loadConfig(env: Env): AppConfig {
  return {
    port: resolvePort(env.PORT),
    // Default local-only (v1 single-user); no Docker o compose passa HOST=0.0.0.0.
    host: env.HOST?.trim() || '127.0.0.1',
    databaseUrl: required(env, 'DATABASE_URL'),
    resend: {
      apiKey: required(env, 'RESEND_API_KEY'),
      from: required(env, 'MAIL_FROM'),
      to: required(env, 'MAIL_TO'),
    },
    cfClearance: env.CF_CLEARANCE?.trim() || undefined,
    scrapeCron: env.SCRAPE_CRON?.trim() || '*/5 * * * *',
  };
}
