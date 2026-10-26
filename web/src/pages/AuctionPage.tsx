import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApi } from '../api/context';
import { AUCTION_DETAIL_URL } from '../api/types';
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
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(enabled: boolean) {
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
        <Link to="/">Leilões</Link>
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
        <dd className="num">{formatGold(a.currentBid)}</dd>
        <dt>Lance mínimo</dt>
        <dd className="num">{formatGold(a.minBid)}</dd>
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
    </article>
  );
}
