import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type {
  PublicMaintenancePlanInfo,
  PublicMaintenancePlanTier,
  PublicMaintenanceSubscription,
} from '@starter/api-client';
import { api } from '../lib/api';
import { InfoTip } from '../components/InfoTip';
import {
  maintenancePresentation,
  maintenanceTierLabel,
  reconciliationMessage,
} from '../lib/maintenance-ui';
import { friendlyPaymentErrorMessage } from '../lib/payment-error-messages';
import './payment.css';

type State =
  | 'loading'
  | 'ready'
  | 'preparing'
  | 'checking'
  | 'canceling'
  | 'selecting-plan'
  | 'error';

export function MaintenanceSubscriptionPage() {
  const { workOrderId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnedPreapprovalId = searchParams.get('preapproval_id');
  const [subscription, setSubscription] = useState<PublicMaintenanceSubscription | null>(null);
  const [maintenancePlan, setMaintenancePlan] = useState<PublicMaintenancePlanInfo | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(true);
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getMaintenanceSubscription(workOrderId)
      .then(
        async ({ subscription: loaded, maintenanceEnabled: enabled, maintenancePlan: plan }) => {
          if (!active) return;
          setSubscription(loaded);
          setMaintenanceEnabled(enabled);
          setMaintenancePlan(plan);
          if (loaded && returnedPreapprovalId) {
            setState('checking');
            const result = await api.reconcileMaintenanceSubscription(loaded.id);
            if (!active) return;
            setSubscription(result.subscription);
            setMessage(
              reconciliationMessage(result.subscription.status, result.subscription.providerStatus),
            );
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('preapproval_id');
            setSearchParams(nextParams, { replace: true });
          } else if (!loaded && returnedPreapprovalId) {
            setMessage(
              'Mercado Pago regresó a LMWares, pero todavía no encontramos la mensualidad. Intenta abrirla otra vez desde tu cuenta.',
            );
          }
          setState('ready');
        },
      )
      .catch((error) => {
        if (!active) return;
        setMessage(friendlyPaymentErrorMessage(error, 'No fue posible cargar la mensualidad.'));
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [returnedPreapprovalId, setSearchParams, workOrderId]);

  const choosePlan = async (plan: PublicMaintenancePlanTier) => {
    setState('selecting-plan');
    setMessage('');
    try {
      const result = await api.selectMaintenancePlan(workOrderId, plan);
      setMaintenancePlan(result.maintenancePlan);
      setState('ready');
    } catch (error) {
      setMessage(
        friendlyPaymentErrorMessage(error, 'No fue posible guardar tu plan de mantenimiento.'),
      );
      setState('error');
    }
  };

  const authorize = async () => {
    const authorizationWindow = window.open('about:blank', '_blank');
    if (authorizationWindow) authorizationWindow.opener = null;
    setState('preparing');
    setMessage('');
    try {
      const result = await api.createMaintenanceSubscription(workOrderId);
      setSubscription(result.subscription);
      if (!result.subscription.authorizationUrl) {
        throw new Error('Mercado Pago no devolvió una URL de autorización.');
      }
      if (authorizationWindow)
        authorizationWindow.location.replace(result.subscription.authorizationUrl);
      else window.location.assign(result.subscription.authorizationUrl);
      setState('ready');
    } catch (error) {
      authorizationWindow?.close();
      setMessage(friendlyPaymentErrorMessage(error, 'No fue posible preparar la mensualidad.'));
      setState('error');
    }
  };

  const reconcile = async () => {
    if (!subscription) return;
    setState('checking');
    setMessage('');
    try {
      const result = await api.reconcileMaintenanceSubscription(subscription.id);
      setSubscription(result.subscription);
      setMessage(
        reconciliationMessage(result.subscription.status, result.subscription.providerStatus),
      );
      setState('ready');
    } catch (error) {
      setMessage(friendlyPaymentErrorMessage(error, 'No fue posible verificar la mensualidad.'));
      setState('error');
    }
  };

  const cancel = async () => {
    if (!subscription) return;
    setState('canceling');
    setMessage('');
    try {
      const result = await api.cancelMaintenanceSubscription(subscription.id);
      setSubscription(result.subscription);
      setMessage('La mensualidad quedó cancelada. No se programarán cobros futuros.');
      setState('ready');
    } catch (error) {
      setMessage(friendlyPaymentErrorMessage(error, 'No fue posible cancelar la mensualidad.'));
      setState('error');
    }
  };

  // Pendiente de elegir plan real: solo ocurre cuando el cliente marcó
  // "configurar luego" en el intake y todavía no ha elegido nada aquí.
  // Mientras esto sea true, no mostramos autorización: mostramos el
  // selector de planes reales.
  const planPending = maintenancePlan?.pending ?? false;
  const planAlreadyDecided = maintenancePlan ? !maintenancePlan.pending : false;
  const noMaintenanceSelected = maintenancePlan?.selected === 'none';
  const presentation = maintenancePresentation(
    subscription?.status ?? null,
    planAlreadyDecided,
    maintenancePlan?.selected ?? null,
  );
  const canAuthorize =
    !planPending &&
    !noMaintenanceSelected &&
    maintenanceEnabled &&
    (!subscription ||
      ['creation_failed', 'pending_authorization', 'payment_attention'].includes(
        subscription.status,
      ));
  const canCancel = Boolean(
    subscription && !['canceled', 'creating', 'creation_failed'].includes(subscription.status),
  );

  if (state === 'loading') {
    return (
      <main className="lmw-payment-page">
        <section className="lmw-payment-shell">
          <p className="lmw-payment-message">Cargando tu mensualidad…</p>
        </section>
      </main>
    );
  }

  if (planPending && maintenancePlan) {
    return (
      <main className="lmw-payment-page">
        <section className="lmw-payment-shell">
          <header className="lmw-payment-header">
            <div>
              <p className="lmw-payment-eyebrow">
                ELIGE TU PLAN DE MANTENIMIENTO
                <InfoTip title="¿Cómo funciona el mantenimiento?">
                  <p>
                    Elegiste "configurar luego" al llenar tu solicitud. El proyecto ya está listo,
                    así que ahora es el momento de decidir: puedes no contratar ningún plan y
                    conservar esta versión como definitiva, o elegir un plan mensual real.
                  </p>
                  <p>
                    El monto que elijas aquí es el que se autoriza con Mercado Pago; ya no puede
                    cambiarse desde el navegador después.
                  </p>
                </InfoTip>
              </p>
              <h1>Elige tu plan de mantenimiento</h1>
              <p>
                El proyecto ya está construido. Elige cómo quieres cuidarlo después de publicarlo;
                esta decisión fija el monto real de tu mensualidad.
              </p>
            </div>
          </header>
          <div className="lmw-payment-grid">
            {maintenancePlan.options.map((option) => {
              const label = maintenanceTierLabel(option.plan);
              return (
                <button
                  className="lmw-payment-card"
                  disabled={state === 'selecting-plan'}
                  key={option.plan}
                  onClick={() => choosePlan(option.plan)}
                  type="button"
                >
                  <p className="lmw-payment-label">{label.name.toUpperCase()}</p>
                  <h2>
                    {formatMoney(option.amountCents)}
                    {option.amountCents > 0 ? '/mes' : ''}
                  </h2>
                  <p>{label.description}</p>
                </button>
              );
            })}
          </div>
          {message ? (
            <p className={`lmw-payment-message ${state === 'error' ? 'is-error' : ''}`}>
              {message}
            </p>
          ) : null}
          <Link className="lmw-payment-back" to="/configurar">
            ← Volver a mi cuenta
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="lmw-payment-page">
      <section className="lmw-payment-shell">
        <header className="lmw-payment-header">
          <div>
            <p className="lmw-payment-eyebrow">
              {noMaintenanceSelected
                ? 'SIN MANTENIMIENTO'
                : planAlreadyDecided
                  ? 'MANTENIMIENTO'
                  : 'MANTENIMIENTO OPCIONAL'}
              <InfoTip title="¿Cómo funciona el mantenimiento?">
                <p>
                  El mantenimiento es opcional. Puedes no contratar ningún plan y conservar esta
                  versión como definitiva; el siguiente paso sería indexarla en Google Search
                  Console sobre tu dominio propio.
                </p>
                <p>
                  O bien, puedes elegir un plan mensual según lo que necesites. Si no estás seguro,
                  coméntalo con tu asesor: la decisión final se confirma junto con LMWares antes de
                  publicar.
                </p>
              </InfoTip>
            </p>
            <h1>{presentation.heading}</h1>
            <p>{presentation.description}</p>
          </div>
          <span className={`lmw-payment-status is-${subscription?.status ?? 'ready'}`}>
            {noMaintenanceSelected
              ? 'Sin mensualidad'
              : subscription
                ? statusLabel(subscription.status)
                : 'Lista para decidir'}
          </span>
        </header>
        <div className="lmw-payment-grid">
          <section className="lmw-payment-card">
            <p className="lmw-payment-label">PROYECTO LISTO</p>
            <h2>Servicio Starter LMWares</h2>
            <p>{presentation.projectMessage}</p>
            <small>Orden: {workOrderId}</small>
          </section>
          <section className="lmw-payment-card is-total">
            <p className="lmw-payment-label">
              {noMaintenanceSelected
                ? 'DECISIÓN CONFIRMADA'
                : planAlreadyDecided
                  ? 'MENSUALIDAD ACORDADA'
                  : 'MENSUALIDAD CONGELADA'}
            </p>
            <strong>
              {noMaintenanceSelected
                ? 'Sin mensualidad'
                : subscription
                  ? formatMoney(subscription.amountCents)
                  : 'Según tu oferta'}
            </strong>
            <span>{noMaintenanceSelected ? 'Pago único' : 'Cada mes'}</span>
            {subscription?.nextPaymentDate ? (
              <small>Próximo cobro: {formatDateTime(subscription.nextPaymentDate)}</small>
            ) : null}
          </section>
        </div>
        <section className="lmw-payment-actions">
          {noMaintenanceSelected ? (
            <p className="lmw-payment-message">
              No necesitas autorizar nada con Mercado Pago. Conservas la entrega como pago único y
              LMWares puede continuar con la publicación.
            </p>
          ) : canAuthorize ? (
            <button
              className="lmw-payment-primary"
              disabled={state === 'preparing'}
              onClick={authorize}
              type="button"
            >
              {state === 'preparing'
                ? 'Preparando…'
                : subscription?.authorizationUrl
                  ? 'Abrir Mercado Pago →'
                  : 'Activar mantenimiento →'}
            </button>
          ) : !maintenanceEnabled &&
            (!subscription ||
              ['creation_failed', 'pending_authorization'].includes(subscription.status)) ? (
            <button className="lmw-payment-primary" disabled type="button">
              Disponible próximamente
            </button>
          ) : null}
          {subscription && !noMaintenanceSelected ? (
            <button
              className="lmw-payment-secondary"
              disabled={state === 'checking'}
              onClick={reconcile}
              type="button"
            >
              {state === 'checking' ? 'Verificando…' : 'Ya autoricé · verificar estado'}
            </button>
          ) : null}
          {canCancel && !noMaintenanceSelected ? (
            <button
              className="lmw-payment-secondary"
              disabled={state === 'canceling'}
              onClick={cancel}
              type="button"
            >
              {state === 'canceling' ? 'Cancelando…' : 'Cancelar mensualidad'}
            </button>
          ) : null}
          <Link className="lmw-payment-back" to="/configurar">
            ← Volver a mi cuenta
          </Link>
        </section>
        {message ? (
          <p className={`lmw-payment-message ${state === 'error' ? 'is-error' : ''}`}>{message}</p>
        ) : null}
        {subscription?.status === 'canceled' ? (
          <p className="lmw-payment-message">
            Esta autorización fue cancelada. Para reactivar el mantenimiento sin duplicar contratos,
            contacta a soporte@lmwares.com.
          </p>
        ) : null}
        <aside className="lmw-payment-note">
          {noMaintenanceSelected
            ? 'Esta decisión no crea una suscripción ni cobros recurrentes. El subdominio de LMWares seguirá disponible como ruta de revisión y operación.'
            : 'El importe, la moneda y la frecuencia provienen de la oferta final aceptada y no pueden cambiarse desde el navegador.'}
        </aside>
      </section>
    </main>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(status: PublicMaintenanceSubscription['status']) {
  const labels: Record<PublicMaintenanceSubscription['status'], string> = {
    creating: 'Preparando',
    creation_failed: 'No creada',
    pending_authorization: 'Pendiente',
    active: 'Activa',
    payment_attention: 'Requiere atención',
    paused: 'Pausada',
    canceled: 'Cancelada',
    disputed: 'En disputa',
  };
  return labels[status];
}
