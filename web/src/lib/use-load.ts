import { useCallback, useEffect, useState } from 'react';

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  setData: (updater: (prev: T) => T) => void;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Carrega `load()` ao montar e sempre que `load` mudar de identidade (passe um useCallback)
 * ou `reloadKey` mudar. Use `reloadKey` para re-buscar sob demanda (ex.: um polling) sem ter
 * de trocar a identidade do `load`. `setData` aplica o resultado de uma mutação sem recarregar.
 */
export function useLoad<T>(load: () => Promise<T>, reloadKey?: unknown): Loaded<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load().then(
      (result) => {
        if (cancelled) return;
        setDataState(result);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // reloadKey entra nas deps de propósito: mudá-lo re-dispara a carga.
  }, [load, reloadKey]);

  const setData = useCallback((updater: (prev: T) => T) => {
    setDataState((prev) => (prev == null ? prev : updater(prev)));
  }, []);

  return { data, error, loading, setData };
}

/** Relógio compartilhado para os timers (1 re-render por segundo na página). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
