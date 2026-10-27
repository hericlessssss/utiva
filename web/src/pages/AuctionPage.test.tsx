import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import type { SessionUser } from '../api/auth';
import { ApiContext } from '../api/context';
import { ApiError } from '../api/http';
import { createMockAuctions } from '../api/mock';
import { SessionProvider } from '../auth/session';
import { AuctionPage } from './AuctionPage';

const USER: SessionUser = { id: 'u1', email: 'a@b.com', name: 'A', picture: null, emailVerified: true };

function renderAt(path: string, api: Partial<Api>, user: SessionUser | null = USER) {
  const full = {
    ...api,
    auth: { me: vi.fn(async () => user), logout: vi.fn(), resendVerification: vi.fn(), loginUrl: () => '/auth/google' },
  } as unknown as Api;
  return render(
    <ApiContext.Provider value={full}>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/leiloes/:id" element={<AuctionPage />} />
            <Route path="/entrar" element={<p>login-page</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ApiContext.Provider>,
  );
}

describe('AuctionPage', () => {
  it('mostra o char, o timer e o link do tibia.com', async () => {
    renderAt('/leiloes/1874207', { auctions: createMockAuctions() });
    expect(await screen.findByRole('heading', { name: 'Lirael Moonwhisper' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'abrir no tibia.com' });
    expect(link.getAttribute('href')).toBe(
      'https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&page=details&source=overview&auctionid=1874207',
    );
    expect(document.querySelector('time.timer-big')).not.toBeNull();
  });

  it('renderiza o detalhe (fase 2): skills, itens e imbuements', async () => {
    renderAt('/leiloes/1874211', { auctions: createMockAuctions() });
    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByText('Axe Fighting')).toBeTruthy();
    expect(screen.getByText('Powerful Vampirism')).toBeTruthy();
    // Itens viram ícones (sprite do proxy): nome no alt, quantidade no badge.
    const coin = screen.getByAltText('crystal coin') as HTMLImageElement;
    expect(coin.src).toContain('/sprites/objects/3043.gif');
    expect(screen.getByText('86')).toBeTruthy();
  });

  it('sem detalhe ainda, mostra o aviso de não carregado', async () => {
    renderAt('/leiloes/1874196', { auctions: createMockAuctions() });
    await screen.findByRole('heading', { name: 'Brann Ironfist' });
    expect(screen.getByText('Detalhe ainda não carregado.')).toBeTruthy();
  });

  it('logado: toggle de acompanhar chama a API e reflete o estado', async () => {
    const auctions = createMockAuctions();
    const spy = vi.spyOn(auctions, 'setWatched');
    renderAt('/leiloes/1874196', { auctions });
    const sw = await screen.findByRole('switch', { name: 'Acompanhar' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
    expect(spy).toHaveBeenCalledWith(1874196, true);
  });

  it('deslogado: clicar em acompanhar manda pra /entrar (não chama a API)', async () => {
    const auctions = createMockAuctions();
    const spy = vi.spyOn(auctions, 'setWatched');
    renderAt('/leiloes/1874196', { auctions }, null); // sem usuário
    const sw = await screen.findByRole('switch', { name: 'Acompanhar' });
    fireEvent.click(sw);
    expect(await screen.findByText('login-page')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('404 vira alerta', async () => {
    const auctions = {
      ...createMockAuctions(),
      detail: vi.fn(async () => {
        throw new ApiError(404, 'leilão não encontrado');
      }),
    };
    renderAt('/leiloes/1', { auctions });
    expect((await screen.findByRole('alert')).textContent).toBe('leilão não encontrado');
  });
});
