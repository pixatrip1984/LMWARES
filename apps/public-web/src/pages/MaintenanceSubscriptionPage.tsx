import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PublicMaintenanceSubscription } from '@starter/api-client';
import { api } from '../lib/api';
import { maintenancePresentation, reconciliationMessage } from '../lib/maintenance-ui';
import './payment.css';

type State = 'loading' | 'ready' | 'preparing' | 'checking' | 'canceling' | 'error';

export function MaintenanceSubscriptionPage() {
  const { workOrderId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnedPreapprovalId = searchParams.get('preapproval_id');
  const [subscription, setSubscription] = useState<PublicMaintenanceSubscription | null>(null);
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    api.getMaintenanceSubscription(workOrderId)
      .then(async ({ subscription: loaded }) => {
        if (!active) return;
        setSubscription(loaded);
        if (loaded && returnedPreapprovalId) {
          setState('checking');
          const result = await api.reconcileMaintenanceSubscription(loaded.id);
          if (!active) return;
          setSubscription(result.subscription);
          setMessage(reconciliationMessage(result.subscription.status, result.subscription.providerStatus));
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('preapproval_id');
          setSearchParams(nextParams, { replace: true });
        } else if (!loaded && returnedPreapprovalId) {
          setMessage('Mercado Pago regresó a LMWares, pero todavía no encontramos la mensualidad. Intenta abrirla otra vez desde tu cuenta.');
        }
        setState('ready');
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'No fue posible cargar la mensualidad.');
        setState('error');
      });
    return () => { active = false; };
  }, [returnedPreapprovalId, setSearchParams, workOrderId]);

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
      if (authorizationWindow) authorizationWindow.location.replace(result.subscription.authorizationUrl);
      else window.location.assign(result.subscription.authorizationUrl);
      setState('ready');
    } catch (error) {
      authorizationWindow?.close();
      setMessage(error instanceof Error ? error.message : 'No fue posible preparar la mensualidad.');
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
      setMessage(reconciliationMessage(result.subscription.status, result.subscription.providerStatus));
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible verificar la mensualidad.');
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
      setMessage(error instanceof Error ? error.message : 'No fue posible cancelar la mensualidad.');
      setState('error');
    }
  };

  const presentation = maintenancePresentation(subscription?.status ?? null);
  const canAuthorize = !subscription || ['creation_failed', 'pending_authorization'].includes(subscription.status);
  const canCancel = Boolean(
    subscription && !['canceled', 'creating', 'creation_failed'].includes(subscription.status),
  );
  return (
    <main className="lmw-payment-page">
      <section className="lmw-payment-shell">
        <header className="lmw-payment-header">
          <div>
            <p className="lmw-payment-eyebrow">COMPUERTA DE PUBLICACIÓN · MENSUALIDAD</p>
            <h1>{presentation.heading}</h1>
            <p>{presentation.description}</p>
          </div>
          <span className={`lmw-payment-status is-${subscription?.status ?? 'ready'}`}>
            {subscription ? statusLabel(subscription.status) : 'Lista para autorizar'}
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
            <p className="lmw-payment-label">MENSUALIDAD CONGELADA</p>
            <strong>{subscription ? formatMoney(subscription.amountCents) : 'Según tu oferta'}</strong>
            <span>Cada mes</span>
            {subscription?.nextPaymentDate ? <small>Próximo cobro: {formatDateTime(subscription.nextPaymentDate)}</small> : null}
          </section>
        </div>
        <section className="lmw-payment-actions">
          {canAuthorize ? (
            <button className="lmw-payment-primary" disabled={state === 'preparing'} onClick={authorize} type="button">
              {state === 'preparing' ? 'Preparando…' : subscription?.authorizationUrl ? 'Abrir Mercado Pago →' : 'Autorizar mensualidad →'}
            </button>
          ) : null}
          {subscription ? (
            <button className="lmw-payment-secondary" disabled={state === 'checking'} onClick={reconcile} type="button">
              {state === 'checking' ? 'Verificando…' : 'Ya autoricé · verificar estado'}
            </button>
          ) : null}
          {canCancel ? (
            <button className="lmw-payment-secondary" disabled={state === 'canceling'} onClick={cancel} type="button">
              {state === 'canceling' ? 'Cancelando…' : 'Cancelar mensualidad'}
            </button>
          ) : null}
          <Link className="lmw-payment-back" to="/configurar">← Volver a mi cuenta</Link>
        </section>
        {message ? <p className={`lmw-payment-message ${state === 'error' ? 'is-error' : ''}`}>{message}</p> : null}
        {subscription?.status === 'canceled' ? (
          <p className="lmw-payment-message">Esta autorización fue cancelada. Para reactivar el mantenimiento sin duplicar contratos, contacta a soporte@lmwares.com.</p>
        ) : null}
        <aside className="lmw-payment-note">El importe, la moneda y la frecuencia provienen de la oferta final aceptada y no pueden cambiarse desde el navegador.</aside>
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
    creating: 'Preparando', creation_failed: 'No creada', pending_authorization: 'Pendiente',
    active: 'Activa', payment_attention: 'Requiere atención', paused: 'Pausada',
    canceled: 'Cancelada', disputed: 'En disputa',
  };
  return labels[status];
}
