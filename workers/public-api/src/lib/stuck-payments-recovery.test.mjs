import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const internalRouteSource = readFileSync(
  new URL('../routes/stuck-payments-internal.ts', import.meta.url),
  'utf8',
);
const reconciliationSource = readFileSync(
  new URL('./subscription-reconciliation.ts', import.meta.url),
  'utf8',
);
const adminRouteSource = readFileSync(
  new URL('../../../admin-api/src/routes/stuck-payments.ts', import.meta.url),
  'utf8',
);

// Contract for the admin "reconciliar ahora" recovery action: the public-api
// internal endpoint must be bearer-token gated, restricted to the four known
// payment kinds, and must delegate every state change to the same per-item
// reconcile* functions the hourly cron already uses (never a bespoke direct
// write, never a call that creates a new checkout/preapproval).

test('the internal reconcile endpoint requires a bearer token match before doing anything', () => {
  assert.match(
    internalRouteSource,
    /stuckPaymentsInternal\.use\('\*', async \(c, next\) => \{/,
  );
  assert.match(internalRouteSource, /safeTokenEqual\(token, c\.env\.OPS_RECOVERY_TOKEN/);
  assert.match(internalRouteSource, /throw AppError\.forbidden/);
});

test('the internal reconcile endpoint only accepts the four known stuck-payment kinds', () => {
  assert.match(internalRouteSource, /'implementation_phase'/);
  assert.match(internalRouteSource, /'package_proposal'/);
  assert.match(internalRouteSource, /'package_subscription'/);
  assert.match(internalRouteSource, /'maintenance_subscription'/);
  assert.match(internalRouteSource, /KNOWN_KINDS\.includes\(kind as StuckPaymentKind\)/);
});

test('each stuck-payment kind delegates to the same per-item reconcile function the cron uses', () => {
  assert.match(internalRouteSource, /reconcileBillingOrderWithProvider\(\{/);
  assert.match(internalRouteSource, /reconcilePackageProposalWithProvider\(\{/);
  assert.match(internalRouteSource, /reconcileSubscriptionWithProvider\(\{/);
  assert.match(internalRouteSource, /reconcileMaintenanceSubscriptionWithProvider\(\{/);

  // The very functions imported here must exist in the reconciliation module
  // as exported, reusable helpers (not duplicated/inlined logic).
  assert.match(reconciliationSource, /export async function reconcileBillingOrderWithProvider/);
  assert.match(
    reconciliationSource,
    /export async function reconcilePackageProposalWithProvider/,
  );
  assert.match(reconciliationSource, /export async function reconcileSubscriptionWithProvider/);
  assert.match(
    reconciliationSource,
    /export async function reconcileMaintenanceSubscriptionWithProvider/,
  );
});

test('a manual reconcile is always recorded as an admin-attributed audit entry', () => {
  const handler = internalRouteSource.slice(
    internalRouteSource.indexOf("post('/stuck-payments/reconcile'"),
  );
  assert.match(handler, /actorType: 'admin'/);
  assert.match(handler, /action: 'lmwares\.stuck_payment\.manual_reconcile'/);
});

test('the admin-api route never calls the provider directly and refuses to proceed without the shared token', () => {
  assert.doesNotMatch(adminRouteSource, /searchMercadoPago|getMercadoPagoPreapproval/);
  assert.match(adminRouteSource, /const token = c\.env\.OPS_RECOVERY_TOKEN\?\.trim\(\)/);
  assert.match(adminRouteSource, /if \(!token\)/);
  assert.match(adminRouteSource, /'conflict'/);
});

test('the admin-api route audits the request before forwarding it, attributed to the acting admin', () => {
  const handler = adminRouteSource.slice(adminRouteSource.indexOf("post('/:kind/:id/reconcile'"));
  const auditIndex = handler.indexOf('manual_reconcile_requested');
  const fetchIndex = handler.indexOf('fetch(');
  assert.ok(auditIndex >= 0, 'expected an audit record before forwarding');
  assert.ok(fetchIndex > auditIndex, 'expected the audit call before the forwarded fetch');
  assert.match(handler, /actorId: admin\.email/);
});
