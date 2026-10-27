import { Navigate } from 'react-router';
import { useSession } from '../auth/session';

export function LoginPage() {
  const { user, loading, loginUrl } = useSession();

  if (loading) return <p className="empty">Carregando…</p>;
  // Já logado não tem o que fazer aqui: manda pra home.
  if (user) return <Navigate to="/" replace />;

  return (
    <section className="login">
      <h1 className="section-label">Entrar na Utiva</h1>
      <p className="login-lead">
        Use sua conta Google para criar filtros, acompanhar leilões e receber os alertas por e-mail.
      </p>
      <a className="btn" href={loginUrl}>
        Entrar com o Google
      </a>
      <p className="home-note">
        Pedimos só nome, e-mail e foto da conta — nada de postar ou acessar seus dados.
      </p>
    </section>
  );
}
