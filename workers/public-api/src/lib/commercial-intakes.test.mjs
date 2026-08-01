import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const intakeSource = readFileSync(new URL('../routes/commercial-intakes.ts', import.meta.url), 'utf8');
const paymentsSource = readFileSync(new URL('../routes/payments.ts', import.meta.url), 'utf8');
const subscriptionsSource = readFileSync(new URL('../routes/subscriptions.ts', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const wranglerSource = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../routes/account.ts', import.meta.url), 'utf8');
const notificationDispatcherSource = readFileSync(
  new URL('../routes/free-jobs-internal.ts', import.meta.url),
  'utf8',
);
const offersSource = readFileSync(new URL('../lib/commercial-offer-public.ts', import.meta.url), 'utf8');
const mercadoPagoSource = readFileSync(new URL('./mercado-pago.ts', import.meta.url), 'utf8');
const billingRepositorySource = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-billing-orders.ts', import.meta.url),
  'utf8',
);
const workOrderRepositorySource = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-starter-work-orders.ts', import.meta.url),
  'utf8',
);
const workOrderMigrationSource = readFileSync(
  new URL('../../../../infra/d1/migrations/0025_lmwares_starter_work_orders.sql', import.meta.url),
  'utf8',
);
const maintenanceRepositorySource = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-maintenance-subscriptions.ts', import.meta.url),
  'utf8',
);
const maintenanceRouteSource = readFileSync(
  new URL('../routes/maintenance-subscriptions.ts', import.meta.url),
  'utf8',
);
const adminCommercialSource = readFileSync(
  new URL('../../../admin-api/src/routes/commercial-intakes.ts', import.meta.url),
  'utf8',
);

test('commercial intake requires a UUID idempotency key and computes prices on the server', () => {
  assert.match(intakeSource, /c\.req\.header\('Idempotency-Key'\)/);
  assert.match(intakeSource, /4\[0-9a-f\]\{3\}/);
  assert.match(intakeSource, /normalizePaidPackageModules\(input\.plan, input\.modules\)/);
  assert.match(intakeSource, /estimateCommercialPackage\(\{ \.\.\.input, modules \}\)/);
  assert.match(intakeSource, /estimatedImplementationCents: estimate\.implementationAmountCents/);
  assert.match(intakeSource, /estimatedMonthlyCents: estimate\.estimatedMonthlyAmountCents/);
});

test('commercial intake freezes on-go-live maintenance and audits only a new record', () => {
  assert.match(intakeSource, /maintenanceStartPolicy: 'on_go_live'/);
  assert.match(intakeSource, /if \(result\.created\) \{/);
  assert.match(intakeSource, /lmwares\.package_intake\.submit/);
  assert.match(intakeSource, /result\.created \? 201 : 200/);
});

test('technical billing creation is closed independently in production', () => {
  assert.match(paymentsSource, /payments\.post\('\/proposals'[\s\S]*?assertTechnicalCheckoutEnabled\(c\.env\)/);
  assert.match(paymentsSource, /payments\.post\('\/proposals\/:id\/checkout'[\s\S]*?assertTechnicalCheckoutEnabled\(c\.env\)/);
  assert.match(subscriptionsSource, /subscriptions\.post\('\/proposals\/:proposalId'[\s\S]*?assertTechnicalCheckoutEnabled\(c\.env\)/);
  assert.match(wranglerSource, /MERCADO_PAGO_TECHNICAL_CHECKOUT_ENABLED = "0"/);
});

test('commercial intake route is exposed through the public worker', () => {
  assert.match(workerSource, /app\.route\('\/commercial-intakes', commercialIntakes\)/);
  assert.match(workerSource, /allowHeaders: \['Content-Type', 'Idempotency-Key'\]/);
});

test('offer acceptance is owner-scoped, terms-versioned and audited idempotently', () => {
  assert.match(intakeSource, /assertTrustedPublicOrigin\(c\)/);
  assert.match(intakeSource, /acceptCommercialOfferSchema/);
  assert.match(intakeSource, /intake\.userId !== session\.user\.id/);
  assert.match(intakeSource, /intakeId: intake\.id/);
  assert.match(intakeSource, /termsVersion: input\.termsVersion/);
  assert.match(intakeSource, /if \(result\.changed\) \{/);
  assert.match(intakeSource, /lmwares\.commercial_offer\.accept/);
});

test('account returns only the sanitized current offer and an in-app notice', () => {
  assert.match(accountSource, /listCurrentForUser\(user\.id\)/);
  assert.match(accountSource, /currentOffer: offersByIntake\.has\(intake\.id\)/);
  assert.match(accountSource, /commercial-offer-issued/);
  assert.match(offersSource, /termsVersion: offer\.termsVersion/);
  assert.doesNotMatch(offersSource, /issuedBy/);
  assert.doesNotMatch(offersSource, /userId/);
});

test('accepted offers create one server-priced implementation order', () => {
  assert.match(intakeSource, /ensureImplementationOrder/);
  assert.match(billingRepositorySource, /INSERT OR IGNORE INTO lmw_billing_orders/);
  assert.match(billingRepositorySource, /o\.implementation_amount_cents/);
  assert.match(billingRepositorySource, /o\.status = 'accepted'/);
  assert.match(billingRepositorySource, /lmw-implementation:\$\{id\}/);
  assert.doesNotMatch(intakeSource, /amountCents: input\./);
});

test('commercial checkout is explicitly enabled and uses a separate Mercado Pago contract', () => {
  assert.match(paymentsSource, /payments\.post\('\/orders\/:id\/checkout'/);
  assert.match(paymentsSource, /assertCommercialPaymentConfiguration\(c\.env\)/);
  assert.match(paymentsSource, /MERCADO_PAGO_COMMERCIAL_ACCESS_TOKEN/);
  assert.match(wranglerSource, /MERCADO_PAGO_COMMERCIAL_PAYMENTS_ENABLED = "1"/);
  assert.match(mercadoPagoSource, /X-Idempotency-Key': `lmwares-billing-\$\{input\.order\.id\}`/);
  assert.match(mercadoPagoSource, /scope=commercial/);
  assert.match(mercadoPagoSource, /external_reference: input\.order\.externalReference/);
});

test('commercial reconciliation verifies frozen reference, currency and amount', () => {
  assert.match(paymentsSource, /assertPaymentMatchesBillingOrder\(payment, order\)/);
  assert.match(paymentsSource, /payment\.externalReference !== order\.externalReference/);
  assert.match(paymentsSource, /payment\.currency !== order\.currency/);
  assert.match(paymentsSource, /Math\.round\(payment\.amount \* 100\) !== order\.amountCents/);
  assert.match(billingRepositorySource, /payment_review_required = 1/);
  assert.match(billingRepositorySource, /ON CONFLICT\(provider_payment_id\) DO UPDATE/);
  assert.match(billingRepositorySource, /SET status = 'converted'/);
  assert.match(billingRepositorySource, /implementation-payment-confirmed:\$\{paidOrder\.id\}/);
  assert.match(billingRepositorySource, /INSERT OR IGNORE INTO lmw_notifications/);
});

test('a confirmed implementation payment creates one supervised Starter work order', () => {
  assert.match(billingRepositorySource, /ensureFromPaidBillingOrder/);
  assert.match(workOrderRepositorySource, /INSERT OR IGNORE INTO lmw_starter_work_orders/);
  assert.match(workOrderRepositorySource, /b\.purpose = 'implementation' AND b\.status = 'paid'/);
  assert.match(workOrderRepositorySource, /'awaiting_provisioning'/);
  assert.match(workOrderMigrationSource, /billing_order_id[\s\S]*?UNIQUE/);
  assert.match(workOrderMigrationSource, /intake_id[\s\S]*?UNIQUE/);
});

test('Starter work cannot go live before the subscription gate', () => {
  assert.match(workOrderRepositorySource, /Primero enlaza un proyecto real de Oracle/);
  assert.match(workOrderRepositorySource, /if \(from === 'in_build'\) return to === 'client_review'/);
  assert.match(workOrderRepositorySource, /if \(from === 'client_review'\) return to === 'in_build' \|\| to === 'ready_to_publish'/);
  assert.match(workOrderRepositorySource, /WHERE work_order_id = \? AND status = 'active'/);
  assert.match(workOrderRepositorySource, /SET status = 'live', published_url = \?/);
  assert.match(adminCommercialSource, /publishStarterWorkOrderSchema/);
  assert.match(adminCommercialSource, /lmwares\.starter_work_order\.go_live/);
});

test('Starter publication creates one idempotent account and email receipt', () => {
  assert.match(workOrderRepositorySource, /'email', 'starter-site-published'/);
  assert.match(workOrderRepositorySource, /starter-site-published:\$\{workOrder\.id\}/);
  assert.match(workOrderRepositorySource, /'maintenanceSubscriptionId', s\.id/);
  assert.match(workOrderRepositorySource, /'monthlyAmountCents', s\.amount_cents/);
  assert.match(notificationDispatcherSource, /buildStarterPublishedEmail/);
  assert.match(notificationDispatcherSource, /notification\.template === 'starter-site-published'/);
});

test('commercial maintenance is frozen from the accepted offer and owner gated', () => {
  assert.match(maintenanceRepositorySource, /o\.monthly_amount_cents/);
  assert.match(maintenanceRepositorySource, /w\.status = 'ready_to_publish'/);
  assert.match(maintenanceRepositorySource, /b\.status = 'paid' AND b\.payment_review_required = 0/);
  assert.match(maintenanceRepositorySource, /o\.status = 'accepted'/);
  assert.match(maintenanceRouteSource, /workOrder\.userId !== userId/);
  assert.match(maintenanceRouteSource, /assertTrustedPublicOrigin\(c\)/);
  assert.match(maintenanceRouteSource, /webhookScope: 'maintenance'/);
  assert.match(paymentsSource, /MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET/);
  assert.match(paymentsSource, /lmwaresMaintenanceSubscriptions\.reconcileAuthorizedPayment/);
  assert.match(paymentsSource, /maintenanceSubscriptionId:/);
  assert.match(wranglerSource, /MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED = "0"/);
  assert.match(wranglerSource, /MERCADO_PAGO_MAINTENANCE_TEST_MODE = "0"/);
});
