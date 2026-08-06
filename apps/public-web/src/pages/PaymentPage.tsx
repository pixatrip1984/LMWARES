import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicPackageProposal, PublicPackageSubscription } from '@starter/api-client';
import { api } from '../lib/api';
import { PACKAGE_MODULES } from '../features/package-builder/packageBuilderModel';
import { friendlyPaymentErrorMessage } from '../lib/payment-error-messages';
import './payment.css';

type LoadState =
  | 'loading'
  | 'ready'
  | 'preparing'
  | 'checking'
  | 'subscribing'
  | 'checking_subscription'
  | 'canceling_subscription'
  | 'error';

export function PaymentPage() {
  const { proposalId = '' } = useParams();
  const [proposal, setProposal] = useState<PublicPackageProposal | null>(null);
  const [subscription, setSubscription] = useState<PublicPackageSubscription | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.getPackageProposal(proposalId), api.getPackageSubscription(proposalId)])
      .then(([{ proposal: loaded }, { subscription: loadedSubscription }]) => {
        if (!active) return;
        setProposal(loaded);
        setSubscription(loadedSubscription);
        setState('ready');
      })
      .catch((error) => {
        if (!active) return;
        setMessage(friendlyPaymentErrorMessage(error, 'No fue posible cargar la propuesta.'));
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [proposalId]);

  const moduleNames = useMemo(() => {
    if (!proposal) return [];
    return proposal.modules.map(
      (id) => PACKAGE_MODULES.find((module) => module.id === id)?.name ?? id,
    );
  }, [proposal]);

  const openCheckout = async () => {
    const checkoutWindow = window.open('about:blank', '_blank');
    if (checkoutWindow) checkoutWindow.opener = null;
    setState('preparing');
    setMessage('');
    try {
      const result = await api.createPackageCheckout(proposalId);
      setProposal(result.proposal);
      if (!result.proposal.checkoutUrl) {
        checkoutWindow?.close();
        throw new Error('Mercado Pago no devolvió una URL de checkout.');
      }
      if (checkoutWindow) {
        checkoutWindow.location.replace(result.proposal.checkoutUrl);
      } else {
        window.location.assign(result.proposal.checkoutUrl);
      }
      setState('ready');
    } catch (error) {
      checkoutWindow?.close();
      const errorMessage = friendlyPaymentErrorMessage(error, 'No fue posible preparar el checkout.');
      try {
        const latest = await api.getPackageProposal(proposalId);
        setProposal(latest.proposal);
        setMessage(
          latest.proposal.status === 'paid'
            ? 'El pago ya estaba confirmado; no abrimos otro checkout.'
            : errorMessage,
        );
        setState('ready');
      } catch {
        setMessage(errorMessage);
        setState('error');
      }
    }
  };

  const reconcile = async () => {
    setState('checking');
    setMessage('');
    try {
      const result = await api.reconcilePackagePayment(proposalId);
      setProposal(result.proposal);
      setMessage(
        result.proposal.paymentReviewRequired
          ? 'Detectamos más de un pago aprobado. La propuesta quedó bloqueada para revisión.'
          : result.proposal.status === 'paid'
            ? 'Pago aprobado y conciliado con la propuesta.'
            : result.found
              ? `Mercado Pago reporta: ${result.proposal.lastProviderStatus ?? 'pendiente'}.`
              : 'Todavía no encontramos un pago para esta propuesta.',
      );
      setState('ready');
    } catch (error) {
      setMessage(friendlyPaymentErrorMessage(error, 'No fue posible verificar el pago.'));
      setState('error');
    }
  };

  const authorizeSubscription = async () => {
    const authorizationWindow = window.open('about:blank', '_blank');
    if (authorizationWindow) authorizationWindow.opener = null;
    setState('subscribing');
    setMessage('');
    try {
      const result =
        subscription && subscription.status !== 'creation_failed'
          ? { subscription }
          : await api.createPackageSubscription(proposalId);
      setSubscription(result.subscription);
      if (!result.subscription.authorizationUrl) {
        authorizationWindow?.close();
        throw new Error('Mercado Pago no devolvió la URL de autorización recurrente.');
      }
      if (authorizationWindow) {
        authorizationWindow.location.replace(result.subscription.authorizationUrl);
      } else {
        window.location.assign(result.subscription.authorizationUrl);
      }
      setState('ready');
    } catch (error) {
      authorizationWindow?.close();
      setMessage(friendlyPaymentErrorMessage(error, 'No fue posible preparar la suscripción.'));
      setState('error');
    }
  };

  const reconcileSubscription = async () => {
    if (!subscription) return;
    setState('checking_subscription');
    setMessage('');
    try {
      const result = await api.reconcilePackageSubscription(subscription.id);
      setSubscription(result.subscription);
      setMessage(
        result.subscription.status === 'active'
          ? 'Suscripción autorizada. Mercado Pago ya programó los cobros mensuales.'
          : result.found
            ? `Mercado Pago reporta la suscripción como ${result.subscription.providerStatus ?? 'pendiente'}.`
            : 'Todavía no encontramos la suscripción en Mercado Pago.',
      );
      setState('ready');
    } catch (error) {
      setMessage(friendlyPaymentErrorMessage(error, 'No fue posible verificar la suscripción.'));
      setState('error');
    }
  };

  const cancelSubscription = async () => {
    if (!subscription) return;
    if (!window.confirm('¿Cancelar esta suscripción técnica en Mercado Pago?')) return;
    setState('canceling_subscription');
    setMessage('');
    try {
      const result = await api.cancelPackageSubscription(subscription.id);
      setSubscription(result.subscription);
      setMessage('La suscripción técnica quedó cancelada en Mercado Pago.');
      setState('ready');
    } catch (error) {
      setMessage(friendlyPaymentErrorMessage(error, 'No fue posible cancelar la suscripción.'));
      setState('error');
    }
  };

  if (state === 'loading') {
    return (
      <main className="lmw-payment-page">
        <p className="lmw-payment-loading">Cargando propuesta…</p>
      </main>
    );
  }

  if (!proposal) {
    return (
      <main className="lmw-payment-page">
        <section className="lmw-payment-card">
          <p className="lmw-payment-eyebrow">CHECKOUT PRO · PRUEBA</p>
          <h1>No pudimos abrir esta propuesta</h1>
          <p className="lmw-payment-message is-error">{message}</p>
          <Link className="lmw-payment-secondary" to="/configurar">
            Volver al configurador
          </Link>
        </section>
      </main>
    );
  }

  const paid = proposal.status === 'paid';
  const paymentReviewRequired = proposal.paymentReviewRequired;
  const testAmount = `${proposal.currency} ${formatCents(proposal.amountCents, proposal.currency)}`;
  return (
    <main className="lmw-payment-page">
      <section className="lmw-payment-shell">
        <header className="lmw-payment-header">
          <div>
            <p className="lmw-payment-eyebrow">CHECKOUT PRO · AMBIENTE DE PRUEBA</p>
            <h1>{paid ? 'Pago de prueba confirmado' : `Valida el flujo con ${testAmount}`}</h1>
            <p>
              Este cobro valida la integración técnica. No sustituye el precio de implementación
              mostrado en tu propuesta comercial.
            </p>
          </div>
          <span className={`lmw-payment-status is-${proposal.status}`}>
            {statusLabel(proposal.status)}
          </span>
        </header>

        <div className="lmw-payment-grid">
          <section className="lmw-payment-card">
            <p className="lmw-payment-label">PROPUESTA CONGELADA</p>
            <h2>{proposal.plan === 'starter' ? 'Starter' : 'Pro'}</h2>
            <ul>
              {moduleNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p className="lmw-payment-astra">
              AstraMuses: próximamente · no forma parte de esta propuesta
            </p>
          </section>

          <section className="lmw-payment-card is-total">
            <p className="lmw-payment-label">VALIDACIÓN TÉCNICA</p>
            <strong>{testAmount}</strong>
            <span>Pago único de prueba</span>
            <small>Referencia: {proposal.id}</small>
          </section>
        </div>

        <section className="lmw-payment-actions">
          {paymentReviewRequired ? (
            <>
              <div className="lmw-payment-message is-error">
                Detectamos un pago adicional. El checkout quedó bloqueado y el caso requiere
                revisión.
              </div>
              <Link className="lmw-payment-primary" to="/configurar">
                Volver a LMWares
              </Link>
            </>
          ) : paid ? (
            <>
              <div className="lmw-payment-success">✓ Mercado Pago confirmó el pago.</div>
              <Link className="lmw-payment-primary" to="/configurar">
                Volver a LMWares
              </Link>
            </>
          ) : proposal.checkoutUrl ? (
            <>
              <button
                className="lmw-payment-primary"
                disabled={state === 'preparing'}
                onClick={openCheckout}
                type="button"
              >
                {state === 'preparing' ? 'Verificando…' : 'Abrir Mercado Pago →'}
              </button>
              <button
                className="lmw-payment-secondary"
                disabled={state === 'checking'}
                onClick={reconcile}
                type="button"
              >
                {state === 'checking' ? 'Verificando…' : 'Ya pagué · verificar estado'}
              </button>
            </>
          ) : (
            <button
              className="lmw-payment-primary"
              disabled={state === 'preparing'}
              onClick={openCheckout}
              type="button"
            >
              {state === 'preparing' ? 'Preparando…' : `Preparar checkout de ${testAmount}`}
            </button>
          )}
          <Link className="lmw-payment-back" to="/configurar">
            ← Volver al paquete
          </Link>
        </section>

        {paid && !paymentReviewRequired ? (
          <section className="lmw-subscription-card">
            <div className="lmw-subscription-copy">
              <p className="lmw-payment-label">SIGUIENTE COMPUERTA · SUSCRIPCIÓN</p>
              <h2>Valida MXN $10 al mes</h2>
              <p>
                Es una prueba técnica independiente del pago único. El precio y la fecha de inicio
                comerciales se definirán en la propuesta real.
              </p>
              {subscription ? (
                <dl className="lmw-subscription-details">
                  <div>
                    <dt>Estado</dt>
                    <dd>{subscriptionStatusLabel(subscription.status)}</dd>
                  </div>
                  <div>
                    <dt>Próximo cobro</dt>
                    <dd>{formatDate(subscription.nextPaymentDate)}</dd>
                  </div>
                  <div>
                    <dt>Último cargo</dt>
                    <dd>{subscription.lastAuthorizedPaymentStatus ?? 'Sin cargos registrados'}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
            <div className="lmw-subscription-actions">
              {!subscription ||
              subscription.status === 'creation_failed' ||
              subscription.status === 'pending_authorization' ? (
                <button
                  className="lmw-payment-primary"
                  disabled={state === 'subscribing'}
                  onClick={authorizeSubscription}
                  type="button"
                >
                  {state === 'subscribing'
                    ? 'Preparando…'
                    : subscription
                      ? 'Abrir autorización en Mercado Pago →'
                      : 'Preparar suscripción mensual'}
                </button>
              ) : null}
              {subscription && subscription.status !== 'canceled' ? (
                <button
                  className="lmw-payment-secondary"
                  disabled={state === 'checking_subscription'}
                  onClick={reconcileSubscription}
                  type="button"
                >
                  {state === 'checking_subscription'
                    ? 'Verificando…'
                    : 'Ya autoricé · verificar estado'}
                </button>
              ) : null}
              {subscription &&
              ['active', 'paused', 'payment_attention'].includes(subscription.status) ? (
                <button
                  className="lmw-payment-danger"
                  disabled={state === 'canceling_subscription'}
                  onClick={cancelSubscription}
                  type="button"
                >
                  {state === 'canceling_subscription' ? 'Cancelando…' : 'Cancelar prueba'}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {message ? (
          <p className={`lmw-payment-message ${state === 'error' ? 'is-error' : ''}`}>{message}</p>
        ) : null}

        <aside className="lmw-payment-note">
          El checkout se abre en otra pestaña porque Mercado Pago no acepta URLs de retorno hacia
          localhost. Cuando termines, vuelve aquí y verifica el estado.
        </aside>
      </section>
    </main>
  );
}

function statusLabel(status: PublicPackageProposal['status']) {
  const labels: Record<PublicPackageProposal['status'], string> = {
    approved_test: 'Lista para checkout',
    checkout_creating: 'Preparando checkout',
    checkout_failed: 'Checkout no creado',
    payment_pending: 'Pago pendiente',
    payment_failed: 'Pago rechazado',
    paid: 'Pago aprobado',
  };
  return labels[status];
}

function formatCents(amountCents: number, currency: string) {
  return new Intl.NumberFormat('es-MX', {
    currency,
    style: 'currency',
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

function subscriptionStatusLabel(status: PublicPackageSubscription['status']) {
  const labels: Record<PublicPackageSubscription['status'], string> = {
    creating: 'Preparando',
    creation_failed: 'No creada',
    pending_authorization: 'Esperando autorización',
    active: 'Activa',
    payment_attention: 'Requiere atención',
    paused: 'Pausada',
    canceled: 'Cancelada',
    disputed: 'En disputa',
  };
  return labels[status];
}

function formatDate(value: string | null) {
  if (!value) return 'Mercado Pago aún no la informa';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}
