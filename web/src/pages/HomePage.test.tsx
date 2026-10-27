import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import { ApiContext } from '../api/context';
import { createMockAuctions } from '../api/mock';
import { HomePage } from './HomePage';

function renderWith(api: Partial<Api>) {
  return render(
    <ApiContext.Provider value={api as Api}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </ApiContext.Provider>,
  );
}

const detailLinks = () =>
  screen.getAllByRole('link').filter((l) => /\/leiloes\/\d+$/.test(l.getAttribute('href') ?? ''));

describe('HomePage', () => {
  it('mostra a frase de efeito (hero)', async () => {
    renderWith({ auctions: createMockAuctions() });
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.textContent).toContain('Bazaar');
  });

  it('lista no máximo 5 leilões, os mais recentes primeiro', async () => {
    renderWith({ auctions: createMockAuctions() }); // mock tem 8
    await screen.findByRole('heading', { level: 1 });
    const links = detailLinks();
    expect(links).toHaveLength(5);
    expect(links[0]!.getAttribute('href')).toBe('/leiloes/1874211'); // mais recente
  });

  it('tem atalho para ver todos os leilões', async () => {
    renderWith({ auctions: createMockAuctions() });
    await screen.findByRole('heading', { level: 1 });
    const all = screen.getAllByRole('link').filter((l) => l.getAttribute('href') === '/leiloes');
    expect(all.length).toBeGreaterThan(0);
  });

  it('não mostra leilões encerrados na vitrine (timer morto)', async () => {
    const base = createMockAuctions();
    const list = vi.fn(async () => {
      const rows = await base.list();
      // força o mais recente (primeiro) a estar encerrado: não deve aparecer no home.
      rows[0] = { ...rows[0]!, status: 'finished' };
      return rows;
    });
    renderWith({ auctions: { ...base, list } });
    await screen.findByRole('heading', { level: 1 });
    const hrefs = detailLinks().map((l) => l.getAttribute('href'));
    expect(hrefs).not.toContain('/leiloes/1874211'); // encerrado, fora
    expect(detailLinks()).toHaveLength(5); // completa com os próximos ativos
  });

  it('traz o descritivo: como funciona e como ativar o e-mail', async () => {
    renderWith({ auctions: createMockAuctions() });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('heading', { name: 'Como funciona' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ativar os alertas por e-mail' })).toBeTruthy();
    expect(screen.getByText('Entre com o Google')).toBeTruthy();
  });

  it('erro da API aparece na tela', async () => {
    const auctions = {
      ...createMockAuctions(),
      list: vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    };
    renderWith({ auctions });
    expect((await screen.findByRole('alert')).textContent).toContain('Failed to fetch');
  });
});
