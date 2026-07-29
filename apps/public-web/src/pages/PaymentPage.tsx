import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicPackageProposal } from '@starter/api-client';
import { api } from '../lib/api';
import { PACKAGE_MODULES } from '../features/package-builder/packageBuilderModel';
import './payment.css';

type LoadState = 'loading' | 'ready' | 'preparing' | 'checking' | 'error';

export function PaymentPage() {
  const { proposalId = '' } = useParams();
  const [proposal, setProposal] = useState<PublicPackageProposal | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getPackageProposal(proposalId)
      .then(({ proposal: loaded }) => {
        if (!active) return;
        setProposal(loaded);
        setState('ready');
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'No fue posible cargar la propuesta.');
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
      const errorMessage =
        error instanceof Error ? error.message : 'No fue posible preparar el checkout.';
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
      setMessage(error instanceof Error ? error.message : 'No fue posible verificar el pago.');
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
              Astramuses: {proposal.marketing ? 'incluido para evaluación separada' : 'no incluido'}
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
