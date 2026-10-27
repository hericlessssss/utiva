import { createHash, randomBytes } from 'node:crypto';

// Endpoints OIDC do Google (descoberta estática — não mudam na prática e evitam um
// request extra ao /.well-known a cada login).
export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Issuers aceitos no `iss` do id_token (o Google emite com e sem esquema). */
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const base64url = (buf: Buffer): string => buf.toString('base64url');

export interface Pkce {
  verifier: string;
  challenge: string;
}

/** Gera o par PKCE (RFC 7636): verifier aleatório + challenge S256 em base64url. */
export function generatePkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Valor opaco para o parâmetro `state` (proteção CSRF do fluxo de autorização). */
export function generateState(): string {
  return base64url(randomBytes(16));
}

export interface AuthUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/** Monta a URL de autorização do Google (Authorization Code + PKCE, escopo OIDC básico). */
export function buildGoogleAuthUrl(params: AuthUrlParams): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'online',
  }).toString();
  return url.toString();
}

/** Claims do id_token que nos interessam (parcial; o Google manda mais). */
export interface IdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Decodifica o payload de um id_token (JWT) SEM verificar assinatura. É seguro porque
 * o token vem direto do endpoint de token do Google por TLS (não do browser) — o Google
 * documenta que, nesse caminho, a verificação de assinatura é dispensável. Ainda assim
 * validamos os claims em `validateIdClaims`.
 */
export function decodeIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('id_token malformado (esperado 3 segmentos)');
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    throw new Error('id_token com payload ilegível');
  }
}

/** Identidade normalizada extraída de um id_token válido. */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Valida os claims do id_token (issuer, audience, expiração, campos essenciais) e
 * devolve a identidade normalizada. Lança se algo não bate — a rota trata como 401.
 */
export function validateIdClaims(
  claims: IdTokenClaims,
  opts: { clientId: string; now?: number },
): GoogleIdentity {
  const now = opts.now ?? Date.now();
  if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) {
    throw new Error(`id_token com issuer inesperado: ${claims.iss ?? '(ausente)'}`);
  }
  if (claims.aud !== opts.clientId) {
    throw new Error('id_token com audience diferente do nosso client_id');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) {
    throw new Error('id_token expirado');
  }
  if (!claims.sub) throw new Error('id_token sem sub');
  if (!claims.email) throw new Error('id_token sem email');
  return {
    sub: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true,
    name: claims.name,
    picture: claims.picture,
  };
}

/** SHA-256 (hex) de um token de sessão — o que vai pro banco (ver model Session). */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Gera um token de sessão opaco (cru, vai pro cookie). */
export function generateSessionToken(): string {
  return base64url(randomBytes(32));
}
