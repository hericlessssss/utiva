import type { WatchFilter, WatchFilterBody } from '../api/types';

/** Estado do form: tudo string (inputs), exceto o toggle. */
export interface FilterForm {
  world: string;
  pvpType: string;
  battleye: string;
  vocation: string;
  levelFrom: string;
  levelTo: string;
  skillId: string;
  skillFrom: string;
  skillTo: string;
  search: string;
  active: boolean;
}

export type FilterFormErrors = Partial<Record<keyof FilterForm, string>>;

const TEXT_FIELDS = [
  'world',
  'pvpType',
  'battleye',
  'vocation',
  'skillId',
  'search',
] as const satisfies readonly (keyof FilterForm)[];

const NUMBER_FIELDS = ['levelFrom', 'levelTo', 'skillFrom', 'skillTo'] as const;

export function emptyFilterForm(): FilterForm {
  return {
    world: '',
    pvpType: '',
    battleye: '',
    vocation: '',
    levelFrom: '',
    levelTo: '',
    skillId: '',
    skillFrom: '',
    skillTo: '',
    search: '',
    active: true,
  };
}

function parseInt0(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

export function validateFilterForm(form: FilterForm): FilterFormErrors {
  const errors: FilterFormErrors = {};
  const n: Partial<Record<(typeof NUMBER_FIELDS)[number], number | null>> = {};

  for (const field of NUMBER_FIELDS) {
    const parsed = parseInt0(form[field]);
    if (Number.isNaN(parsed)) errors[field] = 'inteiro ≥ 0';
    else n[field] = parsed;
  }

  if (n.levelFrom != null && n.levelTo != null && n.levelFrom > n.levelTo) {
    errors.levelTo = 'menor que o mínimo';
  }
  if (n.skillFrom != null && n.skillTo != null && n.skillFrom > n.skillTo) {
    errors.skillTo = 'menor que o mínimo';
  }
  if ((n.skillFrom != null || n.skillTo != null) && form.skillId.trim() === '') {
    errors.skillId = 'escolha a skill';
  }

  return errors;
}

/** Espera o form validado; um número inválido aqui é bug do chamador, então lança. */
export function formToBody(form: FilterForm): WatchFilterBody {
  const body: WatchFilterBody = { active: form.active };
  for (const field of TEXT_FIELDS) {
    const value = form[field].trim();
    body[field] = value === '' ? null : value;
  }
  for (const field of NUMBER_FIELDS) {
    const n = parseInt0(form[field]);
    if (Number.isNaN(n)) throw new Error(`${field} inválido: "${form[field]}"`);
    body[field] = n;
  }
  return body;
}

export function filterToForm(filter: WatchFilter): FilterForm {
  const form = emptyFilterForm();
  for (const field of TEXT_FIELDS) form[field] = filter[field] ?? '';
  for (const field of NUMBER_FIELDS) {
    const value = filter[field];
    form[field] = value == null ? '' : String(value);
  }
  form.active = filter.active;
  return form;
}
