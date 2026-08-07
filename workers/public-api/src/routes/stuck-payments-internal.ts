import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import {
  reconcileBillingOrderWithProvider,
  reconcileMaintenanceSubscriptionWithProvider,
  reconcilePackageProposalWithProvider,
  reconcileSubscriptionWithProvider,
} from '../lib/subscription-reconciliation';
import {
  mercadoPagoCommercialAccessToken,
  mercadoPagoMaintenanceAccessToken,
  mercadoPagoSubscriptionsAccessToken,
} from './payments';

/**
 * Ruta interna, sólo llamada por el Admin API con un bearer token compartido
 * (`OPS_RECOVERY_TOKEN`), nunca expuesta al navegador. Dispara bajo demanda la
 * MISMA reconciliación idempotente que ya corre el cron cada hora para un
 * único pago atascado: busca el pago/cargo ya existente en Mercado Pago y lo
 * aplica sólo si pasa el guard de coincidencia congelada. Nunca crea un
 * checkout, preapproval o cobro nuevo — si el proveedor no tiene nada nuevo,
 * el estado simplemente no cambia.
 */
export const stuckPaymentsInternal = new Hono<{ Bindings: Bindings; Variables: Variables }>();

stuckPaymentsInternal.use('*', async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!(await safeTokenEqual(token, c.env.OPS_RECOVERY_TOKEN ?? ''))) {
    throw AppError.forbidden('Recuperación de pagos no autorizada.');
  }
  await next();
});

type StuckPaymentKind =
  | 'implementation_phase'
  | 'package_proposal'
  | 'package_subscription'
  | 'maintenance_subscription';

const KNOWN_KINDS: readonly StuckPaymentKind[] = [
  'implementation_phase',
  'package_proposal',
  'package_subscription',
  'maintenance_subscription',
];

stuckPaymentsInternal.post('/stuck-payments/reconcile', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = typeof body.kind === 'string' ? body.kind : '';
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const actorEmail = typeof body.actorEmail === 'string' ? body.actorEmail.trim() : null;
  if (!KNOWN_KINDS.includes(kind as StuckPaymentKind) || !id) {
    throw new AppError('validation_error', 'Tipo de pago o identificador inválido.');
  }

  const repos = createRepositories(c.env.DB);
  const auditContext = {
    actorType: 'admin' as const,
    actorId: actorEmail ?? 'admin_unknown',
    action: 'lmwares.stuck_payment.manual_reconcile',
    ip: null,
    userAgent: null,
  };

  switch (kind as StuckPaymentKind) {
    case 'implementation_phase': {
      const before = await repos.lmwaresBillingOrders.getById(id);
      if (!before) throw AppError.notFound('Fase de implementación');
      const result = await reconcileBillingOrderWithProvider({
        env: c.env,
        order: before,
        accessToken: mercadoPagoCommercialAccessToken(c.env),
      });
      await repos.audit.record({
        ...auditContext,
        entityType: 'lmwares_billing_order',
        entityId: id,
        metadata: {
          previousStatus: before.status,
          status: result.order.status,
          paymentsFound: result.paymentsFound,
        },
      });
      return c.json({ kind, id, previousStatus: before.status, status: result.order.status });
    }
    case 'package_proposal': {
      const before = await repos.lmwaresPayments.getById(id);
      if (!before) throw AppError.notFound('Propuesta de paquete');
      const proposalAccessToken = (c.env.MERCADO_PAGO_ACCESS_TOKEN ?? '').trim();
      if (!proposalAccessToken) {
        throw new AppError('internal_error', 'Falta configurar el Access Token de Checkout Pro.');
      }
      const result = await reconcilePackageProposalWithProvider({
        env: c.env,
        proposal: before,
        accessToken: proposalAccessToken,
      });
      await repos.audit.record({
        ...auditContext,
        entityType: 'lmwares_package_proposal',
        entityId: id,
        metadata: {
          previousStatus: before.status,
          status: result.proposal.status,
          paymentsFound: result.paymentsFound,
        },
      });
      return c.json({ kind, id, previousStatus: before.status, status: result.proposal.status });
    }
    case 'package_subscription': {
      const before = await repos.lmwaresSubscriptions.getById(id);
      if (!before) throw AppError.notFound('Mensualidad de paquete');
      const result = await reconcileSubscriptionWithProvider({
        env: c.env,
        subscription: before,
        accessToken: mercadoPagoSubscriptionsAccessToken(c.env),
      });
      await repos.audit.record({
        ...auditContext,
        entityType: 'lmwares_subscription',
        entityId: id,
        metadata: {
          previousStatus: before.status,
          status: result.subscription.status,
          authorizedPaymentsFound: result.authorizedPaymentsFound,
        },
      });
      return c.json({ kind, id, previousStatus: before.status, status: result.subscription.status });
    }
    case 'maintenance_subscription': {
      const before = await repos.lmwaresMaintenanceSubscriptions.getById(id);
      if (!before) throw AppError.notFound('Mensualidad Starter');
      const result = await reconcileMaintenanceSubscriptionWithProvider({
        env: c.env,
        subscription: before,
        accessToken: mercadoPagoMaintenanceAccessToken(c.env),
      });
      await repos.audit.record({
        ...auditContext,
        entityType: 'lmwares_maintenance_subscription',
        entityId: id,
        metadata: {
          previousStatus: before.status,
          status: result.subscription.status,
          authorizedPaymentsFound: result.authorizedPaymentsFound,
        },
      });
      return c.json({ kind, id, previousStatus: before.status, status: result.subscription.status });
    }
  }
});

async function safeTokenEqual(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < left.length && index < right.length; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }
  return diff === 0;
}
