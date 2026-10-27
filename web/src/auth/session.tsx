import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { SessionUser } from '../api/auth';
import { useApi } from '../api/context';

export interface SessionState {
  user: SessionUser | null;
  /** `true` enquanto a sessão inicial (`/auth/me`) ainda não respondeu. */
  loading: boolean;
  /** URL pra onde o botão "Entrar" leva (navegação top-level até o backend). */
  loginUrl: string;
  /** Encerra a sessão no backend e zera o usuário local. */
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.auth.me().then(
      (u) => {
        if (cancelled) return;
        setUser(u);
        setLoading(false);
      },
      () => {
        // Falha de rede ao checar a sessão: trata como deslogado (não trava a UI).
        if (cancelled) return;
        setUser(null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    setUser(null);
  }, [api]);

  const value: SessionState = { user, loading, loginUrl: api.auth.loginUrl(), logout };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession precisa estar dentro de <SessionProvider>');
  return ctx;
}

/** Protege uma rota: sem login manda pra /entrar; enquanto carrega a sessão, mostra um aviso. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  if (loading) return <p className="empty">Carregando…</p>;
  if (!user) return <Navigate to="/entrar" replace />;
  return <>{children}</>;
}
