import { describe, expect, it } from 'vitest';
import {
  emptyFilterForm,
  filterToForm,
  formToBody,
  validateFilterForm,
  type FilterForm,
} from './filter-form';

describe('validateFilterForm', () => {
  it('form vazio é válido', () => {
    expect(validateFilterForm(emptyFilterForm())).toEqual({});
  });

  it('rejeita level que não é inteiro >= 0', () => {
    const form: FilterForm = { ...emptyFilterForm(), levelFrom: '-1', levelTo: '1.5' };
    expect(validateFilterForm(form)).toEqual({
      levelFrom: 'inteiro ≥ 0',
      levelTo: 'inteiro ≥ 0',
    });
  });

  it('rejeita faixa invertida de level e de skill', () => {
    const form: FilterForm = {
      ...emptyFilterForm(),
      levelFrom: '500',
      levelTo: '100',
      skillId: '1',
      skillFrom: '90',
      skillTo: '80',
    };
    expect(validateFilterForm(form)).toEqual({
      levelTo: 'menor que o mínimo',
      skillTo: 'menor que o mínimo',
    });
  });

  it('faixa de skill exige a skill', () => {
    const form: FilterForm = { ...emptyFilterForm(), skillFrom: '80' };
    expect(validateFilterForm(form)).toEqual({ skillId: 'escolha a skill' });
  });
});

describe('formToBody', () => {
  it('vazio vira null, números viram inteiros, texto é aparado', () => {
    const form: FilterForm = {
      ...emptyFilterForm(),
      world: ' Antica ',
      levelFrom: '300',
      active: false,
    };
    expect(formToBody(form)).toEqual({
      world: 'Antica',
      pvpType: null,
      battleye: null,
      vocation: null,
      levelFrom: 300,
      levelTo: null,
      skillId: null,
      skillFrom: null,
      skillTo: null,
      search: null,
      active: false,
    });
  });
});

describe('formToBody com número inválido', () => {
  it('lança em vez de mandar null silencioso', () => {
    const form: FilterForm = { ...emptyFilterForm(), levelFrom: 'abc' };
    expect(() => formToBody(form)).toThrow('levelFrom');
  });
});

describe('filterToForm', () => {
  it('é o inverso de formToBody', () => {
    const filter = {
      id: 7,
      world: 'Antica',
      pvpType: null,
      battleye: null,
      vocation: '2',
      levelFrom: 300,
      levelTo: null,
      skillId: '1',
      skillFrom: 90,
      skillTo: 110,
      search: null,
      active: true,
    };
    const form = filterToForm(filter);
    expect(form.levelFrom).toBe('300');
    expect(form.levelTo).toBe('');
    const expected: Partial<typeof filter> = { ...filter };
    delete expected.id;
    expect(formToBody(form)).toEqual(expected);
  });
});
