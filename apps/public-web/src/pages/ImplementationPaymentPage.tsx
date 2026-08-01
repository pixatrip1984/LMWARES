import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicBillingOrder } from '@starter/api-client';
import { api } from '../lib/api';
import './payment.css';

type State = 'loading' | 'ready' | 'preparing' | 'checking' | 'error';

export function ImplementationPaymentPage() {
  const { orderId = '' } = useParams();
  const [order, setOrder] = useState<PublicBillingOrder | null>(null);
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    api.getBillingOrder(orderId)
      .then(({ order: loaded }) => {
        if (!active) return;
        setOrder(loaded);
        setState('ready');
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'No fue posible cargar la orden.');
        setState('error');
      });
    return () => { active = false; };
  }, [orderId]);

  const prepareCheckout = async () => {
    const checkoutWindow = window.open('about:blank', '_blank');
    if (checkoutWindow) checkoutWindow.opener = null;
    setState('preparing');
    setMessage('');
    try {
      const result = await api.createBillingCheckout(orderId);
      setOrder(result.order);
      if (!result.order.checkoutUrl) throw new Error('Mercado Pago no devolvió una URL de pago.');
      if (checkoutWindow) checkoutWindow.location.replace(result.order.checkoutUrl);
      else window.location.assign(result.order.checkoutUrl);
      setState('ready');
    } catch (error) {
      checkoutWindow?.close();
      setMessage(error instanceof Error ? error.message : 'No fue posible preparar el pago.');
      setState('error');
    }
  };

  const reconcile = async () => {
    setState('checking');
    setMessage('');
    try {
      const result = await api.reconcileBillingOrder(orderId);
      setOrder(result.order);
      setMessage(
        result.order.paymentReviewRequired
          ? 'Detectamos un pago adicional y la orden requiere revisión.'
          : result.order.status === 'paid'
            ? 'Pago confirmado. Ya podemos comenzar la implementación.'
            : result.found
              ? `Mercado Pago reporta: ${result.order.lastProviderStatus ?? 'pendiente'}.`
              : 'Todavía no encontramos un pago para esta orden.',
      );
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible verificar el pago.');
      setState('error');
    }
  };

  if (!order) {
    return (
      <main className="lmw-payment-page">
        <section className="lmw-payment-card">
          <p className="lmw-payment-eyebrow">IMPLEMENTACIÓN · OFERTA ACEPTADA</p>
          <h1>{state === 'loading' ? 'Cargando orden…' : 'No pudimos abrir esta orden'}</h1>
          {message ? <p className="lmw-payment-message is-error">{message}</p> : null}
          <Link className="lmw-payment-secondary" to="/configurar">Volver a LMWares</Link>
        </section>
      </main>
    );
  }

  const paid = order.status === 'paid';
  const total = formatMoney(order.amountCents, order.currency);
  return (
    <main className="lmw-payment-page">
      <section className="lmw-payment-shell">
        <header className="lmw-payment-header">
          <div>
            <p className="lmw-payment-eyebrow">CHECKOUT PRO · IMPLEMENTACIÓN</p>
            <h1>{paid ? 'Pago de implementación confirmado' : 'Completa tu pago de implementación'}</h1>
            <p>El importe proviene de la versión exacta de la oferta que aceptaste.</p>
          </div>
          <span className={`lmw-payment-status is-${order.status}`}>{statusLabel(order.status)}</span>
        </header>
        <div className="lmw-payment-grid">
          <section className="lmw-payment-card">
            <p className="lmw-payment-label">ORDEN CONGELADA</p>
            <h2>Implementación LMWares</h2>
            <p>La mensualidad no comienza con este pago; se autorizará cuando el proyecto esté listo para publicarse.</p>
            <small>Referencia: {order.id}</small>
          </section>
          <section className="lmw-payment-card is-total">
            <p className="lmw-payment-label">TOTAL DE IMPLEMENTACIÓN</p>
            <strong>{total}</strong>
            <span>Pago único</span>
          </section>
        </div>
        <section className="lmw-payment-actions">
          {paid ? (
            <><div className="lmw-payment-success">✓ Mercado Pago confirmó el pago.</div><Link className="lmw-payment-primary" to="/configurar">Volver a LMWares</Link></>
          ) : order.checkoutUrl ? (
            <>
              <button className="lmw-payment-primary" onClick={prepareCheckout} type="button">Abrir Mercado Pago →</button>
              <button className="lmw-payment-secondary" disabled={state === 'checking'} onClick={reconcile} type="button">{state === 'checking' ? 'Verificando…' : 'Ya pagué · verificar estado'}</button>
            </>
          ) : (
            <button className="lmw-payment-primary" disabled={state === 'preparing'} onClick={prepareCheckout} type="button">{state === 'preparing' ? 'Preparando…' : `Pagar ${total}`}</button>
          )}
          <Link className="lmw-payment-back" to="/configurar">← Volver a mi cuenta</Link>
        </section>
        {message ? <p className={`lmw-payment-message ${state === 'error' ? 'is-error' : ''}`}>{message}</p> : null}
        <aside className="lmw-payment-note">La orden no permite cambiar el importe desde el navegador y cada pago se concilia con su referencia, moneda y total exactos.</aside>
      </section>
    </main>
  );
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(cents / 100);
}

function statusLabel(status: PublicBillingOrder['status']) {
  const labels: Record<PublicBillingOrder['status'], string> = {
    ready: 'Lista para pagar', checkout_creating: 'Preparando', checkout_failed: 'No creada',
    payment_pending: 'Pago pendiente', payment_failed: 'Pago rechazado', paid: 'Pago aprobado',
    refunded: 'Reembolsado', charged_back: 'Contracargo', canceled: 'Cancelada',
  };
  return labels[status];
}
