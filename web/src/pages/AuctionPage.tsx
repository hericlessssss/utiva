import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useApi } from '../api/context';
import { useSession } from '../auth/session';
import { AUCTION_DETAIL_URL, type AuctionDetail, type ItemEntry, type SpriteCategory } from '../api/types';
import { Coin } from '../components/Coin';
import { Sprite } from '../components/Sprite';
import { Switch } from '../components/Switch';
import { Timer } from '../components/Timer';
import { formatDate, formatGold } from '../lib/auction-list';
import { errorMessage, useLoad, useNow } from '../lib/use-load';

const STATUS: Record<string, string> = {
  active: 'ativo',
  finished: 'encerrado',
  cancelled: 'cancelado',
};

export function AuctionPage() {
  const { id } = useParams();
  const auctionId = Number(id);
  const api = useApi();
  const load = useCallback(() => api.auctions.detail(auctionId), [api, auctionId]);
  const { data, error, loading, setData } = useLoad(load);
  const now = useNow();
  const { user } = useSession();
  const navigate = useNavigate();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(enabled: boolean) {
    if (!user) return navigate('/entrar'); // acompanhar exige login
    setBusy(true);
    setToggleError(null);
    try {
      const result = await api.auctions.setWatched(auctionId, enabled);
      setData((a) => ({ ...a, watched: { enabled: result.enabled } }));
    } catch (err) {
      setToggleError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p role="alert" className="alert">{error}</p>;
  if (loading || !data) return <p className="empty">Carregando…</p>;

  const a = data;
  const watched = a.watched?.enabled === true;

  return (
    <article className="detail">
      <p className="crumbs">
        <Link to="/leiloes">Leilões</Link>
      </p>

      <header className="detail-head">
        <div>
          <h1>{a.charName}</h1>
          <p className="detail-meta">
            <span className="num">{a.level}</span> {a.vocation} · {a.world}
          </p>
        </div>
        <div className="detail-timer">
          <span className="section-label">Fim em</span>
          <Timer endAt={a.endAt} now={now} size="big" />
        </div>
      </header>

      <div className="detail-actions">
        <Switch
          checked={watched}
          label="Acompanhar"
          showLabel
          disabled={busy || a.status !== 'active'}
          onChange={toggle}
        />
        <a href={`${AUCTION_DETAIL_URL}${a.auctionId}`} target="_blank" rel="noreferrer">
          abrir no tibia.com
        </a>
      </div>
      {toggleError && <p role="alert" className="alert">{toggleError}</p>}

      <dl className="fields">
        <dt>Lance atual</dt>
        <dd className="num bid"><Coin />{formatGold(a.currentBid)}</dd>
        <dt>Lance mínimo</dt>
        <dd className="num bid"><Coin />{formatGold(a.minBid)}</dd>
        <dt>Status</dt>
        <dd>{STATUS[a.status] ?? a.status}</dd>
        <dt>Sexo</dt>
        <dd>{a.sex}</dd>
        <dt>PvP</dt>
        <dd>{a.pvpType ?? '—'}</dd>
        <dt>BattlEye</dt>
        <dd>{a.battleye ?? '—'}</dd>
        <dt>Início</dt>
        <dd>{formatDate(a.startAt)}</dd>
        <dt>Fim</dt>
        <dd>{formatDate(a.endAt)}</dd>
        <dt>Detectado</dt>
        <dd>{formatDate(a.firstSeenAt)}</dd>
        <dt>Visto por último</dt>
        <dd>{formatDate(a.lastSeenAt)}</dd>
        <dt>Leilão</dt>
        <dd className="num">#{a.auctionId}</dd>
      </dl>

      {a.attributes ? (
        <AuctionAttributes detail={a.attributes} />
      ) : (
        <p className="empty">Detalhe ainda não carregado.</p>
      )}
    </article>
  );
}

/** Lista de nomes como chips (imbuements), omitida se vazia. */
function ChipList({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <section className="attr-section">
      <h2 className="section-label">
        {label} <span className="num">{names.length}</span>
      </h2>
      <ul className="chips">
        {names.map((name, i) => (
          <li key={`${name}-${i}`} className="chip">
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Normaliza a lista de ícones. Leilões detalhados antes do ADR 10 guardaram mounts/outfits como
 * `string[]` no jsonb; o backfill não re-busca quem já tem `attributes`, então coagimos aqui:
 * string vira `{name, sprite:null}` (renderiza como texto), objeto passa direto.
 */
function asItems(raw: readonly (string | ItemEntry)[] | undefined | null): ItemEntry[] {
  return (raw ?? []).map((x) => (typeof x === 'string' ? { name: x, count: 1, sprite: null } : x));
}

/** Grade de ícones (itens/mounts/outfits), omitida se vazia. */
function IconGrid({ label, category, items }: { label: string; category: SpriteCategory; items: ItemEntry[] }) {
  if (items.length === 0) return null;
  return (
    <section className="attr-section">
      <h2 className="section-label">
        {label} <span className="num">{items.length}</span>
      </h2>
      <div className="icon-grid">
        {items.map((item, i) => (
          <Sprite key={`${item.name}-${i}`} category={category} item={item} />
        ))}
      </div>
    </section>
  );
}

/** Breakdown da fase 2: skills, itens, imbuements, charms, mounts, outfits e stats gerais. */
function AuctionAttributes({ detail }: { detail: AuctionDetail }) {
  const general = Object.entries(detail.general);
  return (
    <div className="attrs">
      {detail.skills.length > 0 && (
        <section className="attr-section">
          <h2 className="section-label">Skills</h2>
          <ul className="skills">
            {detail.skills.map((s) => (
              <li key={s.name} className="skill-row">
                <span className="skill-name">{s.name}</span>
                <span className="num skill-level">{s.level}</span>
                <span className="skill-bar">
                  <span className="skill-bar-fill" style={{ width: `${s.percent}%` }} />
                </span>
                <span className="muted skill-pct">{s.percent}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.charms.length > 0 && (
        <section className="attr-section">
          <h2 className="section-label">
            Charms <span className="num">{detail.charms.length}</span>
          </h2>
          <ul className="chips">
            {detail.charms.map((c) => (
              <li key={c.name} className="chip">
                {c.name}{' '}
                <span className="muted">
                  {c.type}
                  {c.grade ? ` · ${c.grade}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ChipList label="Imbuements" names={detail.imbuements} />
      <IconGrid label="Itens" category="objects" items={asItems(detail.items)} />
      <IconGrid label="Mounts" category="mounts" items={asItems(detail.mounts)} />
      <IconGrid label="Outfits" category="outfits" items={asItems(detail.outfits)} />

      {general.length > 0 && (
        <section className="attr-section">
          <h2 className="section-label">Geral</h2>
          <dl className="fields">
            {general.map(([key, value]) => [
              <dt key={`${key}-dt`}>{key}</dt>,
              <dd key={`${key}-dd`} className="num">
                {value}
              </dd>,
            ])}
          </dl>
        </section>
      )}
    </div>
  );
}
