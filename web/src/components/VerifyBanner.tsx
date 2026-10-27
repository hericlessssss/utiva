import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '../api/http';
import { useApi } from '../api/context';
import { useSession } from '../auth/session';

type ResendState = 'idle' | 'sending' | 'sent' | 'cooldown' | 'error';

/**
 * Banner do double opt-in (Fase 4). Mostra o sucesso quando o link confirma (`?email=confirmed`)
 * e, pra quem está logado com e-mail ainda pendente, um aviso com botão de reenviar — incluindo
 * o caso do link inválido/expirado (`?email=invalid`).
 */
export function VerifyBanner() {
  const { user } = useSession();
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<ResendState>('idle');

  const emailParam = params.get('email');

  const clearParam = () => {
    const next = new URLSearchParams(params);
    next.delete('email');
    setParams(next, { replace: true });
  };

  if (emailParam === 'confirmed') {
    return (
      <div className="verify-banner verify-banner--ok" role="status">
        <span>E-mail confirmado. Você já vai receber os alertas de leilão.</span>
        <button type="button" className="link-btn" onClick={clearParam}>
          Ok
        </button>
      </div>
    );
  }

  const invalid = emailParam === 'invalid';
  const pending = user != null && !user.emailVerified;
  // Link inválido merece feedback mesmo pra quem não está logado na app (clicou num link antigo).
  // Fora isso, só mostra pra quem está logado com e-mail ainda pendente.
  if (!invalid && !pending) return null;

  const resend = async () => {
    setState('sending');
    try {
      await api.auth.resendVerification();
      setState('sent');
    } catch (err) {
      setState(err instanceof ApiError && err.status === 429 ? 'cooldown' : 'error');
    }
  };

  const message = invalid
    ? `Link inválido ou expirado. ${pending ? 'Reenvie a confirmação para receber os alertas.' : 'Entre para reenviar a confirmação.'}`
    : 'Confirme seu e-mail para receber os alertas de leilão.';

  return (
    <div className="verify-banner verify-banner--warn" role="alert">
      <span>{message}</span>
      {/* Reenviar só faz sentido logado (a rota exige sessão). Deslogado + inválido: só o aviso. */}
      {pending &&
        (state === 'sent' ? (
          <span className="verify-banner-note">Enviado. Veja sua caixa de entrada.</span>
        ) : state === 'cooldown' ? (
          <span className="verify-banner-note">Já enviamos há pouco. Aguarde alguns minutos.</span>
        ) : state === 'error' ? (
          <span className="verify-banner-note">Falhou. Tente de novo.</span>
        ) : (
          <button type="button" className="link-btn" onClick={() => void resend()} disabled={state === 'sending'}>
            {state === 'sending' ? 'Enviando…' : 'Reenviar'}
          </button>
        ))}
    </div>
  );
}
