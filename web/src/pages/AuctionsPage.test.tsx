import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import { ApiContext } from '../api/context';
import { createMockAuctions } from '../api/mock';
import { AuctionsPage } from './AuctionsPage';

function renderWith(api: Partial<Api>) {
  return render(
    <ApiContext.Provider value={api as Api}>
      <MemoryRouter>
        <AuctionsPage />
      </MemoryRouter>
    </ApiContext.Provider>,
  );
}

describe('AuctionsPage', () => {
  it('lista os leilões com link para o detalhe', async () => {
    renderWith({ auctions: createMockAuctions() });
    const link = await screen.findByRole('link', { name: 'Varkos Thunderhide' });
    expect(link.getAttribute('href')).toBe('/leiloes/1874211');
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(1);
  });

  it('mostra o outfit do char e os itens de exibição no card', async () => {
    renderWith({ auctions: createMockAuctions() });
    // outfit: avatar com o nome do char no alt; aponta pro proxy de sprites.
    const outfit = (await screen.findByAltText('Varkos Thunderhide')) as HTMLImageElement;
    expect(outfit.src).toContain('/sprites/outfits/');
    // itens de exibição (showcase) do card.
    expect(screen.getAllByAltText('boots of haste').length).toBeGreaterThan(0);
  });

  it('lista vazia mostra uma linha seca', async () => {
    const auctions = { ...createMockAuctions(), list: vi.fn(async () => []) };
    renderWith({ auctions });
    expect(await screen.findByText('Nenhum leilão ainda.')).toBeTruthy();
  });

  it('erro da API aparece na tela', async () => {
    const auctions = {
      ...createMockAuctions(),
      list: vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    };
    renderWith({ auctions });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Failed to fetch'));
  });
});
