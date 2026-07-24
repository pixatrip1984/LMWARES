import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createDemoSession,
  getDemoSession,
  getProviderName,
  type DemoAuthProvider,
} from '../features/package-builder/demoAuth';
import './packageBuilder.css';

const PROVIDERS: { id: DemoAuthProvider; mark: string; detail: string }[] = [
  { id: 'google', mark: 'G', detail: 'Cuenta personal o de empresa' },
  { id: 'github', mark: 'GH', detail: 'Identidad de desarrollo' },
  { id: 'microsoft', mark: 'M', detail: 'Cuenta institucional' },
];

export function AuthPage() {
  const navigate = useNavigate();
  const [loadingProvider, setLoadingProvider] = useState<DemoAuthProvider | null>(null);
  const existingSession = getDemoSession();

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

  const signIn = (provider: DemoAuthProvider) => {
    setLoadingProvider(provider);
    window.setTimeout(() => {
      createDemoSession(provider);
      navigate('/configurar');
    }, 420);
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
        <span className="lmw-builder-mode">CONFIGURADOR · MODO DEMO</span>
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
            <li><i />Sin pago ni contratación durante esta simulación.</li>
          </ul>
        </section>

        <section className="lmw-auth-card" aria-labelledby="lmw-access-title">
          <div className="lmw-auth-card__status">
            <span>01 / ACCESO</span>
            <i>SESIÓN SIMULADA</i>
          </div>
          <h2 id="lmw-access-title">Continúa para configurar tu paquete.</h2>
          <p>
            Usaremos una identidad de prueba. Cuando conectemos OAuth real, esta pantalla y el
            recorrido permanecerán iguales.
          </p>

          {existingSession ? (
            <button className="lmw-auth-continue" type="button" onClick={() => navigate('/configurar')}>
              <span>CD</span>
              <b>
                Continuar como Cuenta demo
                <small>{existingSession.email}</small>
              </b>
              <i>→</i>
            </button>
          ) : null}

          <div className="lmw-auth-divider"><span>OAuth simulado</span></div>

          <div className="lmw-auth-providers">
            {PROVIDERS.map((provider) => (
              <button
                disabled={loadingProvider !== null}
                key={provider.id}
                onClick={() => signIn(provider.id)}
                type="button"
              >
                <span>{provider.mark}</span>
                <b>
                  Continuar con {getProviderName(provider.id)}
                  <small>{provider.detail}</small>
                </b>
                <i>{loadingProvider === provider.id ? '···' : '↗'}</i>
              </button>
            ))}
          </div>

          <div className="lmw-auth-card__notice">
            <i />
            <span>
              Esta fase no envía información a Google, GitHub o Microsoft. La sesión existe sólo
              en este navegador.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
