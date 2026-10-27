export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Http {
  get<T>(path: string): Promise<T>;
  send<T = void>(method: Method, path: string, body?: unknown): Promise<T>;
}

async function readError(res: Response): Promise<ApiError> {
  const fallback = res.statusText || `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { error?: unknown; message?: unknown };
    const msg = data.error ?? data.message;
    return new ApiError(res.status, typeof msg === 'string' ? msg : fallback);
  } catch {
    return new ApiError(res.status, fallback);
  }
}

export function createHttp(baseUrl: string, fetchFn: typeof fetch = fetch): Http {
  const base = baseUrl.replace(/\/$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // `credentials: 'include'` carrega o cookie de sessão (auth). Em same-origin (prod e a API
    // servindo o web/dist na :3000) é o caminho normal; deixa explícito e cobre um backend
    // cross-origin com CORS, se um dia existir.
    const init: RequestInit = {
      method,
      credentials: 'include',
      headers: { accept: 'application/json' },
    };
    if (body !== undefined) {
      init.headers = { ...init.headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetchFn(`${base}${path}`, init);
    if (!res.ok) throw await readError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    get: (path) => request('GET', path),
    send: (method, path, body) => request(method, path, body),
  };
}
