import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const providerSource = readFileSync(new URL('./mercado-pago.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../routes/subscriptions.ts', import.meta.url), 'utf8');
const paymentsRouteSource = readFileSync(
  new URL('../routes/payments.ts', import.meta.url),
  'utf8',
);
const workerSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const reconciliationSource = readFileSync(
  new URL('./subscription-reconciliation.ts', import.meta.url),
  'utf8',
);
const wranglerSource = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');

const preapprovalStart = providerSource.indexOf(
  'export async function createMercadoPagoPreapproval',
);
const preapprovalEnd = providerSource.indexOf(
  'export async function getMercadoPagoPreapproval',
);
const preapprovalSource = providerSource.slice(preapprovalStart, preapprovalEnd);

test('subscription creation embeds the canonical webhook URL', () => {
  assert.ok(preapprovalStart >= 0 && preapprovalEnd > preapprovalStart);
  assert.match(preapprovalSource, /publicApiUrl: string/);
  assert.match(
    preapprovalSource,
    /input\.webhookScope === 'maintenance'[\s\S]*?'\/payments\/webhooks\/mercado-pago\?scope=maintenance'[\s\S]*?'\/payments\/webhooks\/mercado-pago'/,
  );
  assert.match(preapprovalSource, /notification_url: notificationUrl/);
  assert.match(routeSource, /publicApiUrl: c\.env\.PUBLIC_API_URL/);
});

test('subscription simulator probes require a valid signature and never become billing events', () => {
  const handlerStart = paymentsRouteSource.indexOf(
    'async function handleSubscriptionAuthorizedPaymentWebhook',
  );
  const handlerEnd = paymentsRouteSource.indexOf(
    'async function validateSignedWebhook',
  );
  const handlerSource = paymentsRouteSource.slice(handlerStart, handlerEnd);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handlerSource, /testMode &&/);
  assert.match(
    handlerSource,
    /const probeDataId = await readMercadoPagoSubscriptionProbeDataId\(c\)/,
  );
  assert.match(
    handlerSource,
    /const probeSignature = await validateSignedWebhook\(c, webhookSecrets, probeDataId, testMode\)/,
  );
  assert.match(handlerSource, /if \(probeSignature\.validated\)/);
  assert.match(handlerSource, /return c\.json\(\{ received: true, testProbe: true \}\)/);
  assert.match(handlerSource, /payload\.type !== 'subscription_preapproval'/);
  assert.match(handlerSource, /payload\.entity !== 'preapproval'/);

  const probeReturn = handlerSource.indexOf(
    'return c.json({ received: true, testProbe: true })',
  );
  const providerLookup = handlerSource.indexOf('getMercadoPagoAuthorizedPayment');
  const eventClaim = handlerSource.indexOf('claimWebhookEvent');
  assert.ok(probeReturn >= 0 && probeReturn < providerLookup);
  assert.ok(probeReturn < eventClaim);
});

test('scheduled reconciliation searches invoices by the exact preapproval id', () => {
  const searchStart = providerSource.indexOf(
    'export async function searchMercadoPagoAuthorizedPayments',
  );
  const searchEnd = providerSource.indexOf('export async function cancelMercadoPagoPreapproval');
  const searchSource = providerSource.slice(searchStart, searchEnd);

  assert.ok(searchStart >= 0 && searchEnd > searchStart);
  assert.match(searchSource, /\/authorized_payments\/search\?\$\{query\}/);
  assert.match(searchSource, /preapproval_id: input\.preapprovalId/);
  assert.match(searchSource, /item\.preapprovalId !== input\.preapprovalId/);
  assert.doesNotMatch(searchSource, /limit:/);
  assert.doesNotMatch(searchSource, /offset:/);
});

test('production schedules reconciliation through waitUntil', () => {
  assert.match(workerSource, /scheduled\(controller, env, ctx\)/);
  assert.match(
    workerSource,
    /ctx\.waitUntil\(reconcileSubscriptionsOnSchedule\(env, controller\.scheduledTime\)\)/,
  );
  assert.match(wranglerSource, /\[env\.production\.triggers\]/);
  assert.match(wranglerSource, /crons = \["17 \* \* \* \*", "\* \* \* \* \*"\]/);
  assert.match(workerSource, /if \(controller\.cron === '17 \* \* \* \*'\)/);
  assert.match(workerSource, /ctx\.waitUntil\(processQueuedScopeJob\(env\)\)/);
});

test('maintenance reconciliation continues when creation is closed', () => {
  const start = reconciliationSource.indexOf('async function reconcileMaintenanceSubscriptionsOnSchedule');
  const end = reconciliationSource.indexOf('export function assertPreapprovalMatchesSubscription');
  const source = reconciliationSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN/);
  assert.match(source, /lmwaresMaintenanceSubscriptions\.listForReconciliation/);
  assert.doesNotMatch(source, /MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED/);
});

test('maintenance payment events have their own idempotency namespace', () => {
  assert.match(paymentsRouteSource, /maintenanceEventPrefix = maintenanceScope \? 'maintenance:' : ''/);
  assert.match(paymentsRouteSource, /`\$\{maintenanceEventPrefix\}\$\{requestId\}`/);
  assert.match(paymentsRouteSource, /MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET/);
  assert.match(paymentsRouteSource, /MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN/);
});
