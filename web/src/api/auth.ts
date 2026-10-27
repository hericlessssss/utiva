import { ApiError, type Http } from './http';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  /** Double opt-in (Fase 4): se o e-mail foi confirmado. Pendente → não recebe alertas. */
  emailVerified: boolean;
}

export interface AuthApi {
  /** Usuário da sessão atual, ou `null` quando não há login (401). */
  me(): Promise<SessionUser | null>;
  logout(): Promise<void>;
  /** Reenvia o e-mail de confirmação (double opt-in). */
  resendVerification(): Promise<void>;
  /** URL do backend que inicia o OAuth com o Google (navegação top-level, não fetch). */
  loginUrl(): string;
}

export function createAuthApi(http: Http, baseUrl: string): AuthApi {
  return {
    async me() {
      try {
        return await http.get<SessionUser>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    logout: () => http.send('POST', '/auth/logout'),
    resendVerification: () => http.send('POST', '/auth/resend-verification'),
    loginUrl: () => `${baseUrl}/auth/google`,
  };
}
