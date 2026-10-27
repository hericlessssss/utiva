import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import type { SessionUser } from '../api/auth';
import { ApiContext } from '../api/context';
import { RequireAuth, SessionProvider, useSession } from './session';

function Consumer() {
  const { user, loading, logout } = useSession();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <span data-testid="who">{user ? user.email : 'anon'}</span>
      <button type="button" onClick={() => void logout()}>
        sair
      </button>
    </div>
  );
}

function renderWith(auth: Partial<Api['auth']>) {
  const api = { auth: { me: vi.fn(), logout: vi.fn(), resendVerification: vi.fn(), loginUrl: () => '/auth/google', ...auth } };
  return render(
    <ApiContext.Provider value={api as unknown as Api}>
      <SessionProvider>
        <Consumer />
      </SessionProvider>
    </ApiContext.Provider>,
  );
}

const user: SessionUser = { id: 'u1', email: 'jogador@gmail.com', name: 'Jogador', picture: null, emailVerified: true };

describe('SessionProvider', () => {
  it('expõe o usuário após /auth/me resolver', async () => {
    renderWith({ me: vi.fn(async () => user) });
    expect((await screen.findByTestId('who')).textContent).toBe('jogador@gmail.com');
  });

  it('fica anônimo quando não há sessão', async () => {
    renderWith({ me: vi.fn(async () => null) });
    expect((await screen.findByTestId('who')).textContent).toBe('anon');
  });

  it('logout chama o backend e zera o usuário', async () => {
    const logout = vi.fn(async () => undefined);
    renderWith({ me: vi.fn(async () => user), logout });

    await screen.findByText('jogador@gmail.com');
    fireEvent.click(screen.getByRole('button', { name: 'sair' }));

    await screen.findByText('anon');
    expect(logout).toHaveBeenCalledOnce();
  });
});

describe('RequireAuth', () => {
  function renderGuarded(sessionUser: SessionUser | null) {
    const api = {
      auth: { me: vi.fn(async () => sessionUser), logout: vi.fn(), resendVerification: vi.fn(), loginUrl: () => '/auth/google' },
    };
    return render(
      <ApiContext.Provider value={api as unknown as Api}>
        <SessionProvider>
          <MemoryRouter initialEntries={['/protegida']}>
            <Routes>
              <Route
                path="/protegida"
                element={
                  <RequireAuth>
                    <p>conteudo-protegido</p>
                  </RequireAuth>
                }
              />
              <Route path="/entrar" element={<p>login-page</p>} />
            </Routes>
          </MemoryRouter>
        </SessionProvider>
      </ApiContext.Provider>,
    );
  }

  it('logado: renderiza o conteúdo', async () => {
    renderGuarded(user);
    expect(await screen.findByText('conteudo-protegido')).toBeTruthy();
  });

  it('deslogado: redireciona pra /entrar', async () => {
    renderGuarded(null);
    expect(await screen.findByText('login-page')).toBeTruthy();
  });
});
