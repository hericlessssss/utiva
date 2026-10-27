import { resolvePort } from './env.js';

/** Config do login com Google (OIDC) — Fase 2. Presente só quando GOOGLE_CLIENT_ID está setado. */
export interface AuthConfig {
  googleClientId: string;
  googleClientSecret: string;
  /** Precisa bater com um "Authorized redirect URI" do client no Console. */
  redirectUri: string;
  /** Segredo que assina os cookies de sessão/estado. */
  cookieSecret: string;
  /** Para onde redirecionar o browser após o login. */
  postLoginRedirect: string;
  /** Marca os cookies como Secure (só HTTPS) — ligado quando o redirect é https. */
  secureCookies: boolean;
}

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  resend: { apiKey: string; from: string; to: string };
  cfClearance?: string;
  /** Arquivo onde o cookie cf_clearance renovado é persistido entre restarts (§5). */
  cfClearanceFile: string;
  scrapeCron: string;
  /** Pasta do build do frontend (`web/dist`) a servir na mesma origem; ausente = só API. */
  webDist?: string;
  /** Pasta de cache dos sprites do bazar (ADR 10); default `.sprite-cache`. */
  spriteCacheDir: string;
  /** Login com Google; ausente desliga as rotas /auth/* (ex.: dev sem OAuth configurado). */
  auth?: AuthConfig;
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  return value;
}

/**
 * Monta a config de auth quando GOOGLE_CLIENT_ID está presente. Nesse caso, Secret e
 * Cookie Secret passam a ser obrigatórios (falha rápido em vez de subir um login quebrado).
 * Sem GOOGLE_CLIENT_ID, devolve undefined e as rotas /auth/* não são registradas.
 */
function loadAuthConfig(env: Env): AuthConfig | undefined {
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  if (!googleClientId) return undefined;

  const redirectUri = env.OAUTH_REDIRECT_URI?.trim() || 'http://localhost:3000/auth/callback';
  return {
    googleClientId,
    googleClientSecret: required(env, 'GOOGLE_CLIENT_SECRET'),
    redirectUri,
    cookieSecret: required(env, 'COOKIE_SECRET'),
    postLoginRedirect: env.POST_LOGIN_REDIRECT?.trim() || '/',
    secureCookies: redirectUri.startsWith('https:'),
  };
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
    cfClearanceFile: env.CF_CLEARANCE_FILE?.trim() || '.cf-clearance.json',
    scrapeCron: env.SCRAPE_CRON?.trim() || '*/5 * * * *',
    webDist: env.WEB_DIST?.trim() || undefined,
    spriteCacheDir: env.SPRITE_CACHE_DIR?.trim() || '.sprite-cache',
    auth: loadAuthConfig(env),
  };
}
