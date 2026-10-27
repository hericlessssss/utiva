import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildGoogleAuthUrl,
  decodeIdToken,
  generatePkce,
  generateSessionToken,
  generateState,
  hashSessionToken,
  validateIdClaims,
  type IdTokenClaims,
} from '../../src/auth/oidc.js';

/** Monta um id_token falso (header.payload.sig) — só o payload importa aqui. */
function fakeIdToken(claims: IdTokenClaims): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.assinatura`;
}

const clientId = 'client-123.apps.googleusercontent.com';
const validClaims: IdTokenClaims = {
  iss: 'https://accounts.google.com',
  aud: clientId,
  sub: '10769150350006150715113082367',
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: 'jogador@gmail.com',
  email_verified: true,
  name: 'Jogador',
  picture: 'https://lh3.googleusercontent.com/a/foto',
};

describe('generatePkce', () => {
  it('challenge é o S256(verifier) em base64url', () => {
    const { verifier, challenge } = generatePkce();
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
    expect(verifier).not.toContain('=');
  });

  it('gera verifiers diferentes a cada chamada', () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
  });
});

describe('generateState / tokens', () => {
  it('state e session token são opacos e únicos', () => {
    expect(generateState()).not.toBe(generateState());
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it('hashSessionToken é o SHA-256 hex do token', () => {
    expect(hashSessionToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});

describe('buildGoogleAuthUrl', () => {
  it('inclui os parâmetros do fluxo code + PKCE', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId,
        redirectUri: 'http://localhost:3000/auth/callback',
        state: 'xyz',
        codeChallenge: 'chal',
      }),
    );
    const q = url.searchParams;
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(q.get('client_id')).toBe(clientId);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    expect(q.get('state')).toBe('xyz');
    expect(q.get('code_challenge')).toBe('chal');
    expect(q.get('code_challenge_method')).toBe('S256');
  });
});

describe('decodeIdToken', () => {
  it('lê o payload do JWT', () => {
    expect(decodeIdToken(fakeIdToken(validClaims)).sub).toBe(validClaims.sub);
  });

  it('rejeita token sem 3 segmentos', () => {
    expect(() => decodeIdToken('a.b')).toThrow(/malformado/);
  });
});

describe('validateIdClaims', () => {
  it('aceita claims válidos e normaliza a identidade', () => {
    const id = validateIdClaims(validClaims, { clientId });
    expect(id).toEqual({
      sub: validClaims.sub,
      email: 'jogador@gmail.com',
      emailVerified: true,
      name: 'Jogador',
      picture: 'https://lh3.googleusercontent.com/a/foto',
    });
  });

  it('aceita issuer sem esquema', () => {
    expect(() =>
      validateIdClaims({ ...validClaims, iss: 'accounts.google.com' }, { clientId }),
    ).not.toThrow();
  });

  it('rejeita audience de outro client', () => {
    expect(() => validateIdClaims({ ...validClaims, aud: 'outro' }, { clientId })).toThrow(
      /audience/,
    );
  });

  it('rejeita issuer estranho', () => {
    expect(() => validateIdClaims({ ...validClaims, iss: 'https://evil.com' }, { clientId })).toThrow(
      /issuer/,
    );
  });

  it('rejeita token expirado', () => {
    const expired = { ...validClaims, exp: Math.floor(Date.now() / 1000) - 10 };
    expect(() => validateIdClaims(expired, { clientId })).toThrow(/expirado/);
  });

  it('rejeita quando falta sub ou email', () => {
    expect(() => validateIdClaims({ ...validClaims, sub: undefined }, { clientId })).toThrow(/sub/);
    expect(() => validateIdClaims({ ...validClaims, email: undefined }, { clientId })).toThrow(
      /email/,
    );
  });
});
