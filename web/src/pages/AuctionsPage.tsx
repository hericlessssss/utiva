import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/context';
import type { Auction } from '../api/types';
import { Sprite } from '../components/Sprite';
import { Switch } from '../components/Switch';
import { Timer } from '../components/Timer';
import {
  bidOf,
  filterAuctions,
  formatGold,
  SORT_LABELS,
  sortAuctions,
  type ListFilter,
  type SortKey,
} from '../lib/auction-list';
import { errorMessage, useLoad, useNow } from '../lib/use-load';

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function AuctionsPage() {
  const api = useApi();
  const load = useCallback(() => api.auctions.list(), [api]);
  const { data, error, loading, setData } = useLoad(load);
  const now = useNow();

  const [sort, setSort] = useState<SortKey>('recent');
  const [filter, setFilter] = useState<ListFilter>({ world: '', vocation: '', watchedOnly: false });
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const worlds = useMemo(() => uniqueSorted((data ?? []).map((a) => a.world)), [data]);
  const vocations = useMemo(() => uniqueSorted((data ?? []).map((a) => a.vocation)), [data]);
  const rows = useMemo(
    () => (data ? sortAuctions(filterAuctions(data, filter), sort) : []),
    [data, filter, sort],
  );

  async function toggle(auction: Auction, enabled: boolean) {
    setBusy(auction.auctionId);
    setToggleError(null);
    try {
      const result = await api.auctions.setWatched(auction.auctionId, enabled);
      setData((list) =>
        list.map((a) => (a.auctionId === result.auctionId ? { ...a, watched: { enabled: result.enabled } } : a)),
      );
    } catch (err) {
      setToggleError(`${auction.charName}: ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="toolbar">
        <h1 className="section-label">Leilões</h1>
        <label>
          <span>Mundo</span>
          <select value={filter.world} onChange={(e) => setFilter({ ...filter, world: e.target.value })}>
            <option value="">todos</option>
            {worlds.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Vocação</span>
          <select value={filter.vocation} onChange={(e) => setFilter({ ...filter, vocation: e.target.value })}>
            <option value="">todas</option>
            {vocations.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Ordem</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filter.watchedOnly}
            onChange={(e) => setFilter({ ...filter, watchedOnly: e.target.checked })}
          />
          <span>Só acompanhados</span>
        </label>
      </div>

      {error && <p role="alert" className="alert">{error}</p>}
      {toggleError && <p role="alert" className="alert">{toggleError}</p>}
      {loading && !data && <p className="empty">Carregando…</p>}
      {data && rows.length === 0 && (
        <p className="empty">{data.length === 0 ? 'Nenhum leilão ainda.' : 'Nada com esse filtro.'}</p>
      )}

      {rows.length > 0 && (
        <table className="auctions">
          <thead>
            <tr>
              <th scope="col">Char</th>
              <th scope="col" className="num">Level</th>
              <th scope="col">Vocação</th>
              <th scope="col">Mundo</th>
              <th scope="col" className="num">Lance</th>
              <th scope="col" className="num">Fim em</th>
              <th scope="col">
                <span className="sr-only">Acompanhar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const watched = a.watched?.enabled === true;
              return (
                <tr key={a.auctionId} className={watched ? 'watched' : undefined}>
                  <td className="char">
                    <div className="char-cell">
                      {a.outfit && (
                        <Sprite
                          category="outfits"
                          item={{ name: a.charName, count: 1, sprite: a.outfit }}
                          size="sm"
                          hideOnError
                        />
                      )}
                      <div className="char-cell-main">
                        <Link to={`/leiloes/${a.auctionId}`}>{a.charName}</Link>
                        {a.displayItems && a.displayItems.length > 0 && (
                          <div className="char-items">
                            {a.displayItems.map((item, i) => (
                              <Sprite key={`${item.name}-${i}`} category="objects" item={item} size="sm" />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="num level">{a.level}</td>
                  <td className="voc">{a.vocation}</td>
                  <td className="world">{a.world}</td>
                  <td className="num bid">
                    {formatGold(bidOf(a))}
                    {a.currentBid == null && a.minBid != null && <small> mín</small>}
                  </td>
                  <td className="num ends">
                    <Timer endAt={a.endAt} now={now} />
                  </td>
                  <td className="toggle">
                    <Switch
                      checked={watched}
                      label={`Acompanhar ${a.charName}`}
                      disabled={busy === a.auctionId || a.status !== 'active'}
                      onChange={(next) => toggle(a, next)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
