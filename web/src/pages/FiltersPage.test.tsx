import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import { ApiContext } from '../api/context';
import type { FiltersApi } from '../api/filters';
import type { WatchFilter } from '../api/types';
import { FiltersPage } from './FiltersPage';

const preset: WatchFilter = {
  id: 1,
  world: 'Antica',
  pvpType: null,
  battleye: null,
  vocation: '3',
  levelFrom: 300,
  levelTo: 600,
  skillId: null,
  skillFrom: null,
  skillTo: null,
  search: null,
  active: true,
};

function fakeFilters(initial: WatchFilter[] = []): FiltersApi {
  const data = [...initial];
  return {
    list: vi.fn(async () => [...data]),
    create: vi.fn(async (body) => {
      const created = { ...preset, ...body, id: data.length + 1 } as WatchFilter;
      data.push(created);
      return created;
    }),
    update: vi.fn(async (id, body) => {
      const i = data.findIndex((f) => f.id === id);
      data[i] = { ...data[i]!, ...body } as WatchFilter;
      return data[i]!;
    }),
    remove: vi.fn(async (id) => {
      data.splice(
        data.findIndex((f) => f.id === id),
        1,
      );
    }),
  };
}

function renderWith(filters: FiltersApi) {
  return render(
    <ApiContext.Provider value={{ filters } as Api}>
      <FiltersPage />
    </ApiContext.Provider>,
  );
}

describe('FiltersPage', () => {
  it('lista os presets existentes', async () => {
    renderWith(fakeFilters([preset]));
    const desc = await screen.findByText(/Antica/);
    expect(desc.textContent).toBe('Antica · Knight · lvl 300–600');
  });

  it('valida inline sem chamar a API', async () => {
    const filters = fakeFilters();
    renderWith(filters);
    await screen.findByText('Nenhum preset ainda.');
    fireEvent.change(screen.getByLabelText('Level de'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Level até'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('menor que o mínimo')).toBeTruthy();
    expect(filters.create).not.toHaveBeenCalled();
    // corrigir o outro limite da faixa limpa o erro sem novo submit
    fireEvent.change(screen.getByLabelText('Level de'), { target: { value: '50' } });
    expect(screen.queryByText('menor que o mínimo')).toBeNull();
  });

  it('cria um preset e ele aparece na lista', async () => {
    const filters = fakeFilters();
    renderWith(filters);
    await screen.findByText('Nenhum preset ainda.');
    fireEvent.change(screen.getByLabelText('Mundo'), { target: { value: 'Secura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(filters.create).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Secura/)).toBeTruthy();
  });

  it('toggle ativo chama update', async () => {
    const filters = fakeFilters([preset]);
    renderWith(filters);
    await screen.findByText(/Antica/);
    const [rowSwitch] = screen.getAllByRole('switch', { name: 'Ativo' }).slice(-1);
    fireEvent.click(rowSwitch!);
    await waitFor(() => expect(filters.update).toHaveBeenCalledWith(1, { active: false }));
  });

  it('excluir chama remove', async () => {
    const filters = fakeFilters([preset]);
    renderWith(filters);
    await screen.findByText(/Antica/);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(filters.remove).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Nenhum preset ainda.')).toBeTruthy();
  });
});
