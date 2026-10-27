import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import type { SessionUser } from '../api/auth';
import { ApiContext } from '../api/context';
import { ApiError } from '../api/http';
import { SessionProvider } from '../auth/session';
import { VerifyBanner } from './VerifyBanner';

const pending: SessionUser = { id: 'u1', email: 'a@b.com', name: 'A', picture: null, emailVerified: false };
const verified: SessionUser = { ...pending, emailVerified: true };

function renderBanner(
  user: SessionUser | null,
  opts: { path?: string; resend?: () => Promise<void> } = {},
) {
  const api = {
    auth: {
      me: vi.fn(async () => user),
      logout: vi.fn(),
      resendVerification: opts.resend ?? vi.fn(async () => undefined),
      loginUrl: () => '/auth/google',
    },
  };
  return render(
    <ApiContext.Provider value={api as unknown as Api}>
      <MemoryRouter initialEntries={[opts.path ?? '/']}>
        <SessionProvider>
          <VerifyBanner />
        </SessionProvider>
      </MemoryRouter>
    </ApiContext.Provider>,
  );
}

describe('VerifyBanner', () => {
  it('pendente: mostra aviso e reenvia ao clicar', async () => {
    const resend = vi.fn(async () => undefined);
    renderBanner(pending, { resend });

    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar' }));

    expect(resend).toHaveBeenCalledOnce();
    expect(await screen.findByText(/caixa de entrada/i)).toBeTruthy();
  });

  it('confirmado: não mostra nada', async () => {
    const { container } = renderBanner(verified);
    // espera a sessão resolver; o banner deve seguir ausente
    await Promise.resolve();
    expect(container.querySelector('.verify-banner')).toBeNull();
  });

  it('?email=confirmed: mostra sucesso', async () => {
    renderBanner(verified, { path: '/?email=confirmed' });
    expect(await screen.findByText(/e-mail confirmado/i)).toBeTruthy();
  });

  it('?email=invalid + pendente: avisa link inválido com reenviar', async () => {
    renderBanner(pending, { path: '/?email=invalid' });
    expect(await screen.findByText(/inválido ou expirado/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reenviar' })).toBeTruthy();
  });

  it('?email=invalid deslogado: ainda avisa, sem botão de reenviar', async () => {
    renderBanner(null, { path: '/?email=invalid' });
    expect(await screen.findByText(/inválido ou expirado/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull();
  });

  it('reenvio no cooldown (429): pede pra aguardar', async () => {
    const resend = vi.fn(async () => {
      throw new ApiError(429, 'throttled');
    });
    renderBanner(pending, { resend });

    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar' }));
    expect(await screen.findByText(/aguarde/i)).toBeTruthy();
  });
});
