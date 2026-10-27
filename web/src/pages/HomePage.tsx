import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/context';
import { Coin } from '../components/Coin';
import { Sprite } from '../components/Sprite';
import { Timer } from '../components/Timer';
import { bidOf, formatGold, sortAuctions } from '../lib/auction-list';
import { useLoad, useNow } from '../lib/use-load';

const RECENT_COUNT = 5;
const REFRESH_MS = 60_000; // acompanha o cron: re-busca periodicamente os leilões mais recentes

export function HomePage() {
  const api = useApi();
  // `tick` muda de tempos em tempos e entra nas deps do `load` → força o useLoad a re-buscar,
  // então a home reflete o que o cron gravou sem precisar recarregar a página.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(() => {
    void tick; // a mudança de `tick` re-cria o load → useLoad re-busca (acompanha o cron)
    return api.auctions.list();
  }, [api, tick]);
  const { data, error, loading } = useLoad(load);
  const now = useNow();
  // Só leilões ativos na vitrine pública: um encerrado apareceria com timer zerado, péssima
  // primeira impressão.
  const recent = useMemo(
    () => (data ? sortAuctions(data.filter((a) => a.status === 'active'), 'recent').slice(0, RECENT_COUNT) : []),
    [data],
  );

  return (
    <div className="home">
      <section className="hero">
        <p className="hero-kicker">Char Bazaar do Tibia</p>
        <h1 className="hero-title">O char que você caça entra no Bazaar e você fica sabendo na hora.</h1>
        <p className="hero-sub">
          A Utiva vigia o leilão sem parar e te manda um e-mail assim que surge um personagem com a
          sua cara — pelos filtros que você escolheu. E ainda avisa quando o leilão está acabando.
        </p>
        <div className="hero-cta">
          <Link to="/leiloes" className="btn">
            Ver os leilões
          </Link>
          <Link to="/filtros" className="btn btn-ghost">
            Meus filtros
          </Link>
        </div>
      </section>

      <section className="home-recent">
        <div className="home-recent-head">
          <h2 className="section-label">Leilões recentes</h2>
          <Link to="/leiloes">ver todos →</Link>
        </div>

        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {loading && !data && <p className="empty">Carregando…</p>}
        {data && recent.length === 0 && <p className="empty">Nenhum leilão ainda.</p>}

        <ul className="home-cards">
          {recent.map((a) => (
            <li key={a.auctionId}>
              <Link to={`/leiloes/${a.auctionId}`} className="home-card">
                {a.outfit && (
                  <Sprite
                    category="outfits"
                    item={{ name: a.charName, count: 1, sprite: a.outfit }}
                    size="outfit"
                    hideOnError
                  />
                )}
                <div className="home-card-main">
                  <span className="home-card-name">{a.charName}</span>
                  <span className="home-card-meta">
                    <span className="num">{a.level}</span> {a.vocation} · {a.world}
                  </span>
                  <span className="home-card-bid num bid">
                    <Coin />
                    {formatGold(bidOf(a))}
                    {a.currentBid == null && a.minBid != null && <small> mín</small>}
                  </span>
                </div>
                <div className="home-card-end">
                  <span className="section-label">fim em</span>
                  <Timer endAt={a.endAt} now={now} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-about">
        <h2 className="section-label">Como funciona</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <h3>Monte seus filtros</h3>
            <p>Mundo, vocação, level, skills — os mesmos campos do Char Bazaar. Pode ter quantos quiser.</p>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <h3>A Utiva vigia o leilão</h3>
            <p>A cada poucos minutos ela varre a lista do Bazaar e cruza cada char novo com os seus filtros.</p>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <h3>Você é avisado</h3>
            <p>Deu match, cai um e-mail na hora. E quando um leilão que você acompanha está acabando, chega lembrete.</p>
          </li>
        </ol>
      </section>

      <section className="home-about">
        <h2 className="section-label">Ativar os alertas por e-mail</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <h3>Entre com o Google</h3>
            <p>Usa o e-mail da sua conta Google — sem senha nova pra criar nem lembrar.</p>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <h3>Crie filtros e acompanhe leilões</h3>
            <p>Defina o que você caça e marque os leilões que quer seguir até o fim.</p>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <h3>Confirme o e-mail</h3>
            <p>A gente manda um link de confirmação uma vez. Clicou, os alertas começam a chegar.</p>
          </li>
        </ol>
        <p className="home-note">Login com Google está sendo montado e chega na próxima atualização.</p>
      </section>
    </div>
  );
}
