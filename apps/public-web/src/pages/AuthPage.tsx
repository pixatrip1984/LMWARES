import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PublicAuthSession } from '@starter/domain';
import { api } from '../lib/api';
import './packageBuilder.css';

export function AuthPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<PublicAuthSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTitle = document.title;
    document.body.style.overflow = 'auto';
    document.title = 'Acceso · LMWares';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let active = true;
    api.getAuthSession()
      .then((result) => {
        if (active) setSession(result);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setSessionLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = () => {
    setStarting(true);
    window.location.assign(api.getGoogleAuthUrl('/configurar'));
  };

  return (
    <div className="lmw-builder-shell lmw-auth-shell">
      <div className="lmw-builder-backdrop" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <header className="lmw-builder-topbar">
        <Link className="lmw-builder-brand" to="/">
          <span>LM</span>WARES<i />
        </Link>
        <span className="lmw-builder-mode">CONFIGURADOR · ACCESO SEGURO</span>
      </header>

      <main className="lmw-auth-layout">
        <section className="lmw-auth-story">
          <p className="lmw-builder-eyebrow">Tu proyecto comienza aquí</p>
          <h1>
            Arma una solución
            <br />
            alrededor de tu operación.
          </h1>
          <p className="lmw-auth-story__lead">
            Elige capacidades, descubre el plan mínimo compatible y conserva el control sobre lo
            que realmente entra en el alcance.
          </p>

          <div className="lmw-auth-signal" aria-hidden="true">
            <div><b>01</b><span>PRESENCIA</span></div>
            <i />
            <div><b>02</b><span>OPERACIÓN</span></div>
            <i />
            <div><b>03</b><span>ESCALA</span></div>
          </div>

          <ul className="lmw-auth-proof">
            <li><i />Recomendación automática, selección manual.</li>
            <li><i />Un borrador que puedes ajustar antes de hablar con nosotros.</li>
            <li><i />Sin pago ni contratación durante esta etapa.</li>
          </ul>
        </section>

        <section className="lmw-auth-card" aria-labelledby="lmw-access-title">
          <div className="lmw-auth-card__status">
            <span>01 / ACCESO</span>
            <i>GOOGLE OIDC</i>
          </div>
          <h2 id="lmw-access-title">Continúa para configurar tu paquete.</h2>
          <p>
            Tu cuenta identifica la solicitud, protege tus imágenes y recibe la URL cuando tu
            página Free esté publicada.
          </p>

          {sessionLoaded && session?.authenticated && session.user ? (
            <button className="lmw-auth-continue" type="button" onClick={() => navigate('/configurar')}>
              <span>{initials(session.user.name, session.user.email)}</span>
              <b>
                Continuar como {session.user.name ?? session.user.email}
                <small>{session.user.email}</small>
              </b>
              <i>→</i>
            </button>
          ) : null}

          <div className="lmw-auth-divider"><span>Acceso protegido</span></div>

          <div className="lmw-auth-providers">
            <button disabled={starting} onClick={signIn} type="button">
              <span>G</span>
              <b>
                Continuar con Google
                <small>Cuenta personal o de empresa</small>
              </b>
              <i>{starting ? '···' : '↗'}</i>
            </button>
          </div>

          <div className="lmw-auth-card__notice">
            <i />
            <span>
              Sólo solicitamos identidad básica: nombre, email y perfil. La sesión usa una cookie
              segura y no concede permisos de pago.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

function initials(name: string | null, email: string) {
  return (name ?? email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
