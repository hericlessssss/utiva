import { NavLink, Route, Routes } from 'react-router';
import { AuctionPage } from './pages/AuctionPage';
import { AuctionsPage } from './pages/AuctionsPage';
import { FiltersPage } from './pages/FiltersPage';

export function App() {
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="wordmark" end>
          UTIVA
        </NavLink>
        <nav aria-label="Principal">
          <NavLink to="/" end>
            Leilões
          </NavLink>
          <NavLink to="/filtros">Filtros</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<AuctionsPage />} />
          {/* Rotas em pt-BR de propósito: não podem colidir com as da API (/auctions, /filters),
              já que em prod a API serve o painel na mesma origem. */}
          <Route path="/leiloes/:id" element={<AuctionPage />} />
          <Route path="/filtros" element={<FiltersPage />} />
          <Route path="*" element={<p className="empty">Página não encontrada.</p>} />
        </Routes>
      </main>
    </>
  );
}
