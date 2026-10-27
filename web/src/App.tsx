import { NavLink, Route, Routes } from 'react-router';
import { RequireAuth, useSession } from './auth/session';
import { VerifyBanner } from './components/VerifyBanner';
import { AuctionPage } from './pages/AuctionPage';
import { AuctionsPage } from './pages/AuctionsPage';
import { FiltersPage } from './pages/FiltersPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

/** Área de login/usuário do topbar. */
function AuthControl() {
  const { user, loading, logout } = useSession();

  if (loading) return <span className="topbar-auth" aria-hidden />;
  if (!user) {
    return (
      <NavLink to="/entrar" className="topbar-auth-login">
        Entrar
      </NavLink>
    );
  }
  return (
    <div className="topbar-auth">
      {user.picture && <img className="user-avatar" src={user.picture} alt="" width={22} height={22} />}
      <span className="user-name">{user.name ?? user.email}</span>
      <button type="button" className="link-btn" onClick={() => void logout()}>
        Sair
      </button>
    </div>
  );
}

export function App() {
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="wordmark" end>
          UTIVA
        </NavLink>
        <nav aria-label="Principal">
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/leiloes">Leilões</NavLink>
          <NavLink to="/filtros">Filtros</NavLink>
        </nav>
        <AuthControl />
      </header>
      <VerifyBanner />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* Rotas em pt-BR de propósito: não podem colidir com as da API (/auctions, /filters,
              /auth), já que em prod a API serve o painel na mesma origem. */}
          <Route path="/leiloes" element={<AuctionsPage />} />
          <Route path="/leiloes/:id" element={<AuctionPage />} />
          <Route
            path="/filtros"
            element={
              <RequireAuth>
                <FiltersPage />
              </RequireAuth>
            }
          />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="*" element={<p className="empty">Página não encontrada.</p>} />
        </Routes>
      </main>
    </>
  );
}
