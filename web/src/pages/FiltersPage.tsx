import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { useApi } from '../api/context';
import type { WatchFilter } from '../api/types';
import { Switch } from '../components/Switch';
import {
  emptyFilterForm,
  filterToForm,
  formToBody,
  validateFilterForm,
  type FilterForm,
  type FilterFormErrors,
} from '../lib/filter-form';
import { BATTLEYE, labelOf, PVP_TYPES, SKILLS, VOCATIONS, WORLDS, type Option } from '../lib/options';
import { errorMessage, useLoad } from '../lib/use-load';

type TextField = Exclude<keyof FilterForm, 'active'>;

function describe(f: WatchFilter): string {
  const parts = [
    f.world,
    labelOf(VOCATIONS, f.vocation),
    f.levelFrom != null || f.levelTo != null ? `lvl ${f.levelFrom ?? ''}–${f.levelTo ?? ''}` : '',
    f.skillId ? `${labelOf(SKILLS, f.skillId)} ${f.skillFrom ?? ''}–${f.skillTo ?? ''}` : '',
    labelOf(PVP_TYPES, f.pvpType),
    labelOf(BATTLEYE, f.battleye),
    f.search ? `"${f.search}"` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'sem critérios';
}

export function FiltersPage() {
  const api = useApi();
  const load = useCallback(() => api.filters.list(), [api]);
  const { data, error, loading, setData } = useLoad(load);

  const [form, setForm] = useState<FilterForm>(emptyFilterForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<FilterFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  function set(field: TextField, value: string) {
    const next = { ...form, [field]: value };
    setForm(next);
    // Depois da primeira tentativa, revalida ao vivo (erros de faixa dependem de dois campos).
    if (Object.keys(errors).length > 0) setErrors(validateFilterForm(next));
  }

  function reset() {
    setForm(emptyFilterForm());
    setEditing(null);
    setErrors({});
    setFormError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateFilterForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = formToBody(form);
      if (editing == null) {
        const created = await api.filters.create(body);
        setData((list) => [...list, created]);
      } else {
        const updated = await api.filters.update(editing, body);
        setData((list) => list.map((f) => (f.id === updated.id ? updated : f)));
      }
      reset();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(f: WatchFilter, active: boolean) {
    setRowError(null);
    try {
      const updated = await api.filters.update(f.id, { active });
      setData((list) => list.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setRowError(errorMessage(err));
    }
  }

  async function remove(id: number) {
    setRowError(null);
    try {
      await api.filters.remove(id);
      setData((list) => list.filter((f) => f.id !== id));
      if (editing === id) reset();
    } catch (err) {
      setRowError(errorMessage(err));
    } finally {
      setConfirmDelete(null);
    }
  }

  const field = (name: TextField, label: string, input: (id: string, invalid: boolean) => ReactNode) => {
    const id = `f-${name}`;
    const err = errors[name];
    return (
      <div className={`field${err ? ' invalid' : ''}`}>
        <label htmlFor={id}>{label}</label>
        {input(id, Boolean(err))}
        {err && (
          <span id={`${id}-err`} className="field-error">
            {err}
          </span>
        )}
      </div>
    );
  };

  const text = (name: TextField, label: string, extra?: { list?: string; inputMode?: 'numeric' }) =>
    field(name, label, (id, invalid) => (
      <input
        id={id}
        value={form[name]}
        list={extra?.list}
        inputMode={extra?.inputMode}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : undefined}
        onChange={(e) => set(name, e.target.value)}
      />
    ));

  const select = (name: TextField, label: string, options: Option[], any: string) =>
    field(name, label, (id, invalid) => (
      <select
        id={id}
        value={form[name]}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : undefined}
        onChange={(e) => set(name, e.target.value)}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ));

  return (
    <section>
      <form className="filter-form" onSubmit={submit} noValidate>
        <h1 className="section-label">{editing == null ? 'Novo preset' : `Editar #${editing}`}</h1>
        <div className="grid">
          {text('world', 'Mundo', { list: 'worlds' })}
          {select('vocation', 'Vocação', VOCATIONS, 'todas')}
          {text('levelFrom', 'Level de', { inputMode: 'numeric' })}
          {text('levelTo', 'Level até', { inputMode: 'numeric' })}
          {select('skillId', 'Skill', SKILLS, 'nenhuma')}
          {text('skillFrom', 'Skill de', { inputMode: 'numeric' })}
          {text('skillTo', 'Skill até', { inputMode: 'numeric' })}
          {select('pvpType', 'PvP', PVP_TYPES, 'todos')}
          {select('battleye', 'BattlEye', BATTLEYE, 'todos')}
          {text('search', 'Busca')}
        </div>
        <datalist id="worlds">
          {WORLDS.map((w) => (
            <option key={w} value={w} />
          ))}
        </datalist>
        <div className="form-actions">
          <Switch
            checked={form.active}
            label="Ativo"
            showLabel
            onChange={(active) => setForm((f) => ({ ...f, active }))}
          />
          <span className="spacer" />
          {editing != null && (
            <button type="button" className="ghost" onClick={reset}>
              Cancelar
            </button>
          )}
          <button type="submit" disabled={saving}>
            Salvar
          </button>
        </div>
        {formError && <p role="alert" className="alert">{formError}</p>}
      </form>

      <h2 className="section-label">Presets</h2>
      {error && <p role="alert" className="alert">{error}</p>}
      {rowError && <p role="alert" className="alert">{rowError}</p>}
      {loading && !data && <p className="empty">Carregando…</p>}
      {data && data.length === 0 && <p className="empty">Nenhum preset ainda.</p>}
      {data && data.length > 0 && (
        <ul className="presets">
          {data.map((f) => (
            <li key={f.id} className={f.active ? '' : 'inactive'}>
              <span className="num preset-id">#{f.id}</span>
              <span className="preset-desc">{describe(f)}</span>
              <Switch checked={f.active} label="Ativo" onChange={(active) => setActive(f, active)} />
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setForm(filterToForm(f));
                  setEditing(f.id);
                  setErrors({});
                  setFormError(null);
                }}
              >
                Editar
              </button>
              {confirmDelete === f.id ? (
                <>
                  <button type="button" className="danger" onClick={() => remove(f.id)}>
                    Confirmar
                  </button>
                  <button type="button" className="ghost" onClick={() => setConfirmDelete(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" className="ghost" onClick={() => setConfirmDelete(f.id)}>
                  Excluir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
