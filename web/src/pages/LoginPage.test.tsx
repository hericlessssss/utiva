import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import type { SessionUser } from '../api/auth';
import { ApiContext } from '../api/context';
import { SessionProvider } from '../auth/session';
import { LoginPage } from './LoginPage';

function renderWith(user: SessionUser | null, loginUrl = 'http://127.0.0.1:3000/auth/google') {
  const api = {
    auth: { me: vi.fn(async () => user), logout: vi.fn(), resendVerification: vi.fn(), loginUrl: () => loginUrl },
  };
  return render(
    <ApiContext.Provider value={api as unknown as Api}>
      <SessionProvider>
        <MemoryRouter initialEntries={['/entrar']}>
          <Routes>
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/" element={<p>home-marker</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ApiContext.Provider>,
  );
}

const user: SessionUser = { id: 'u1', email: 'jogador@gmail.com', name: 'Jogador', picture: null, emailVerified: true };

describe('LoginPage', () => {
  it('deslogado: mostra o link de login do Google com o href do backend', async () => {
    renderWith(null);
    const link = await screen.findByRole('link', { name: /entrar com o google/i });
    expect(link.getAttribute('href')).toBe('http://127.0.0.1:3000/auth/google');
  });

  it('logado: redireciona pra home', async () => {
    renderWith(user);
    expect(await screen.findByText('home-marker')).toBeTruthy();
  });
});
