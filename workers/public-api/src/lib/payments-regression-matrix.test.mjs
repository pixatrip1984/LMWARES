import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const paymentsSource = readFileSync(new URL('../routes/payments.ts', import.meta.url), 'utf8');
const paymentsRepositorySource = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-payments.ts', import.meta.url),
  'utf8',
);

// Cross-cutting regression matrix for webhook idempotency and provider-state
// handling across the four payment groups: implementation phases (billing
// orders), package proposals (technical/test checkout), package
// subscriptions and maintenance subscriptions. Each group must claim its
// webhook event before doing any work, short-circuit as a duplicate without
// re-running side effects, and release the claim on failure so a genuinely
// failed attempt can be retried without ever double-processing a settled one.

function sliceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `expected to find "${startMarker}"`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `expected to find "${endMarker}" after "${startMarker}"`);
  return source.slice(start, end);
}

test('claimWebhookEvent is a single idempotent gate shared by all four payment groups', () => {
  // Every entry point below is expected to call the exact same repository
  // method before touching a proposal, billing order or subscription. A
  // second call with the same provider_request_id must return null (already
  // processed or currently processing) so the route can short-circuit.
  const paymentHandler = sliceFunction(
    paymentsSource,
    "payments.post('/webhooks/mercado-pago'",
    'async function handleSubscriptionPreapprovalWebhook',
  );
  const preapprovalHandler = sliceFunction(
    paymentsSource,
    'async function handleSubscriptionPreapprovalWebhook',
    'async function handleSubscriptionAuthorizedPaymentWebhook',
  );
  const authorizedPaymentHandler = sliceFunction(
    paymentsSource,
    'async function handleSubscriptionAuthorizedPaymentWebhook',
    'async function readMercadoPagoSubscriptionProbeDataId',
  );

  for (const handler of [paymentHandler, preapprovalHandler, authorizedPaymentHandler]) {
    assert.match(handler, /claimWebhookEvent\(/);
    assert.match(handler, /if \(!eventId\) return c\.json\(\{ received: true, duplicate: true \}\);|if \(!eventId\) \{\s*\n\s*return c\.json\(\{ received: true, duplicate: true \}\);/);
  }

  // The payment handler (implementation phases + package proposals +
  // both subscription families' authorized single payments) claims before
  // branching by external_reference prefix, so every branch below it is
  // already inside the idempotent gate.
  assert.ok(paymentHandler.indexOf('claimWebhookEvent') < paymentHandler.indexOf("startsWith('lmw-implementation:')"));
});

test('a failed reconciliation releases the webhook claim instead of leaving it stuck', () => {
  for (const handler of [
    sliceFunction(
      paymentsSource,
      "payments.post('/webhooks/mercado-pago'",
      'async function handleSubscriptionPreapprovalWebhook',
    ),
    sliceFunction(
      paymentsSource,
      'async function handleSubscriptionPreapprovalWebhook',
      'async function handleSubscriptionAuthorizedPaymentWebhook',
    ),
    sliceFunction(
      paymentsSource,
      'async function handleSubscriptionAuthorizedPaymentWebhook',
      'async function readMercadoPagoSubscriptionProbeDataId',
    ),
  ]) {
    assert.match(handler, /catch \(error\) \{/);
    assert.match(handler, /failWebhookEvent\(/);
    // Re-throwing after marking the event failed keeps the HTTP response an
    // error (so Mercado Pago retries) while still allowing a future retry to
    // reclaim the same provider_request_id via claimWebhookEvent.
    assert.match(handler, /failWebhookEvent\(\s*\n?\s*eventId,[\s\S]{0,80}\);\s*\n\s*throw error;/);
  }
});

test('claimWebhookEvent only reclaims a failed event, never a processed or in-flight one', () => {
  assert.match(paymentsRepositorySource, /status = 'processing'/);
  assert.match(
    paymentsRepositorySource,
    /WHERE provider_request_id = \? AND status = 'failed'/,
  );
  // A second insert attempt for the same provider_request_id is ignored by
  // the unique constraint; only a row already marked 'failed' is eligible to
  // be retried, and even then only via a status-guarded UPDATE.
  assert.match(paymentsRepositorySource, /INSERT OR IGNORE INTO lmw_payment_webhook_events/);
  assert.match(
    paymentsRepositorySource,
    /UPDATE lmw_payment_webhook_events\s*\n\s*SET status = 'processing',\s*\n\s*attempts = attempts \+ 1,/,
  );
});

test('maintenance and package subscription webhooks never cross-resolve into each other\'s table', () => {
  // maintenanceScope selects the repository at the very first lookup for
  // both the preapproval and the authorized-payment handlers, so a
  // maintenance-scoped notification can only ever touch
  // lmwaresMaintenanceSubscriptions and a commercial one only ever touches
  // lmwaresSubscriptions.
  const preapprovalHandler = sliceFunction(
    paymentsSource,
    'async function handleSubscriptionPreapprovalWebhook',
    'async function handleSubscriptionAuthorizedPaymentWebhook',
  );
  const authorizedPaymentHandler = sliceFunction(
    paymentsSource,
    'async function handleSubscriptionAuthorizedPaymentWebhook',
    'async function readMercadoPagoSubscriptionProbeDataId',
  );
  for (const handler of [preapprovalHandler, authorizedPaymentHandler]) {
    assert.match(
      handler,
      /const subscription = maintenanceScope\s*\n\s*\? \(await repos\.lmwaresMaintenanceSubscriptions\./,
      );
    assert.match(handler, /: \(await repos\.lmwaresSubscriptions\./);
  }
});

test('a settled/frozen amount, currency or reference mismatch always throws before any state changes', () => {
  // Each payment group has its own dedicated "assert*Matches*" guard, called
  // before reconcilePayment/savePreapproval/reconcileAuthorizedPayment, so a
  // provider payload can never silently move money-adjacent state for the
  // wrong proposal, billing order or subscription.
  assert.match(paymentsSource, /assertPaymentMatchesBillingOrder\(payment, order\);/);
  assert.match(paymentsSource, /assertPaymentMatchesProposal\(payment, proposal\);/);
  assert.match(paymentsSource, /assertPaymentMatchesSubscription\(payment, subscription\);/);
  assert.match(paymentsSource, /assertPreapprovalMatchesSubscription\(provider, subscription\);/);
  assert.match(paymentsSource, /assertAuthorizedPaymentMatchesSubscription\(provider, subscription\);/);

  for (const guard of [
    'assertPaymentMatchesBillingOrder',
    'assertPaymentMatchesProposal',
    'assertPaymentMatchesSubscription',
    'assertPreapprovalMatchesSubscription',
    'assertAuthorizedPaymentMatchesSubscription',
  ]) {
    const definitionStart = paymentsSource.indexOf(`function ${guard}(`);
    assert.ok(definitionStart >= 0, `expected a definition for ${guard}`);
    const definitionEnd = paymentsSource.indexOf('\n}', definitionStart) + 2;
    const body = paymentsSource.slice(definitionStart, definitionEnd);
    assert.match(body, /throw new AppError\(\s*\n?\s*'internal_error'/);
  }
});

test('an unresolved proposal, billing order or subscription is ignored, never treated as a fresh payment', () => {
  // Ignoring an unmatched external_reference (instead of throwing or
  // creating a row) is what makes replaying an old/foreign webhook safe: it
  // completes the webhook event as 'ignored' and stops, rather than
  // fabricating a payment against nothing.
  const occurrences = paymentsSource.split("status: 'ignored'").length - 1;
  assert.ok(
    occurrences >= 3,
    'expected the billing-order, proposal/subscription and preapproval/authorized-payment branches to all short-circuit unmatched references as ignored',
  );
});
