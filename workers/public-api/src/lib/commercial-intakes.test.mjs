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
  assert.match(intakeSource, /estimateCommercialPackage\(\{ \.\.\.input, modules, marketing \}\)/);
  assert.match(intakeSource, /estimatedImplementationCents: estimate\.implementationAmountCents/);
  assert.match(intakeSource, /estimatedMonthlyCents: estimate\.estimatedMonthlyAmountCents/);
  assert.match(intakeSource, /normalizeCommercialMarketing\(input\.marketing\)/);
});

test('commercial intake freezes on-go-live maintenance and audits only a new record', () => {
  assert.match(intakeSource, /maintenanceStartPolicy: 'on_go_live'/);
  assert.match(intakeSource, /if \(result\.created\) \{/);
  assert.match(intakeSource, /lmwares\.package_intake\.submit/);
  assert.match(intakeSource, /result\.created \? 201 : 200/);
});

test('closed commercial submission keys cannot masquerade as a fresh review request', () => {
  const packageIntakeRepositorySource = readFileSync(
    new URL('../../../../packages/db/src/repositories/lmwares-package-intakes.ts', import.meta.url),
    'utf8',
  );
  assert.match(packageIntakeRepositorySource, /isOpenPackageIntakeStatus/);
  assert.match(packageIntakeRepositorySource, /Esta solicitud ya fue cerrada/);
  assert.match(packageIntakeRepositorySource, /submitted_at DESC/);
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

test('accepted offers create four server-priced implementation phase orders', () => {
  assert.match(intakeSource, /ensureImplementationPhases/);
  assert.match(billingRepositorySource, /INSERT OR IGNORE INTO lmw_billing_orders/);
  assert.match(billingRepositorySource, /splitImplementationIntoPhases\(offer\.implementation_amount_cents\)/);
  assert.match(billingRepositorySource, /status = 'accepted'/);
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

test('commercial recovery and late SPEI settlement cannot expose a second charge', () => {
  assert.match(
    billingRepositorySource,
    /lmw_billing_payment_attempts pa[\s\S]*?pa\.disposition = 'pending'/,
  );
  assert.match(
    billingRepositorySource,
    /La orden tiene una transferencia pendiente\. Espera su resolución/,
  );
  assert.match(billingRepositorySource, /superseded_by_confirmed_payment/);
  assert.match(billingRepositorySource, /parallel_payment_pending_after_other_paid/);
  assert.match(
    billingRepositorySource,
    /SET status = 'accepted'[\s\S]*?status IN \('accepted', 'superseded'\)/,
  );
  assert.match(billingRepositorySource, /disposition = 'duplicate_review'/);
});

test('paying one implementation phase never flags or cancels its sibling phases', () => {
  // A paying phase (1-4) must only ever be treated as a conflicting/duplicate
  // payment against a *different* commercial offer version, never against a
  // sibling phase row that belongs to the same accepted offer.
  assert.match(
    billingRepositorySource,
    /purpose = 'implementation' AND id <> \?\s*\n\s*AND \(commercial_offer_id IS NULL OR commercial_offer_id <> \?\)\s*\n\s*AND status = 'paid'/,
  );
  assert.match(
    billingRepositorySource,
    /SET status = 'canceled', checkout_url = NULL,[\s\S]*?AND \(commercial_offer_id IS NULL OR commercial_offer_id <> \?\)/,
  );
  assert.match(
    billingRepositorySource,
    /SET payment_review_required = 1,[\s\S]*?AND \(commercial_offer_id IS NULL OR commercial_offer_id <> \?\)/,
  );
});

test('a confirmed implementation payment creates one supervised Starter work order', () => {
  assert.match(billingRepositorySource, /ensureFromPaidBillingOrder/);
  assert.match(workOrderRepositorySource, /INSERT OR IGNORE INTO lmw_starter_work_orders/);
  assert.match(workOrderRepositorySource, /b\.purpose = 'implementation' AND b\.phase = 1 AND b\.status = 'paid'/);
  assert.match(workOrderRepositorySource, /'awaiting_provisioning'/);
  assert.match(workOrderMigrationSource, /billing_order_id[\s\S]*?UNIQUE/);
  assert.match(workOrderMigrationSource, /intake_id[\s\S]*?UNIQUE/);
});

test('Starter publication requires maintenance only when the accepted offer has a monthly amount', () => {
  assert.match(workOrderRepositorySource, /Primero enlaza un proyecto real de Oracle/);
  assert.match(workOrderRepositorySource, /if \(from === 'in_build'\) return to === 'client_review'/);
  assert.match(workOrderRepositorySource, /if \(from === 'client_review'\) return to === 'in_build' \|\| to === 'ready_to_publish'/);
  assert.match(workOrderRepositorySource, /monthly_amount_cents > 0 && !publicationGate\.subscription_id/);
  assert.match(workOrderRepositorySource, /o\.monthly_amount_cents = 0/);
  assert.match(workOrderRepositorySource, /status = 'active'/);
  assert.match(workOrderRepositorySource, /SET status = 'live', published_url = \?/);
  assert.match(adminCommercialSource, /publishStarterWorkOrderSchema/);
  assert.match(adminCommercialSource, /lmwares\.starter_work_order\.go_live/);
});

test('phased implementation payments gate client_review, ready_to_publish and go-live', () => {
  assert.match(workOrderRepositorySource, /PHASE_GATE_BY_TARGET_STATUS/);
  assert.match(workOrderRepositorySource, /client_review: 2,/);
  assert.match(workOrderRepositorySource, /ready_to_publish: 3,/);
  assert.match(workOrderRepositorySource, /assertPhasePaid\(current\.commercialOfferId, requiredPhase\)/);
  assert.match(workOrderRepositorySource, /assertPhasePaid\(current\.commercialOfferId, 4\)/);
  assert.match(
    workOrderRepositorySource,
    /bo\.purpose = 'implementation' AND bo\.phase = 4 AND bo\.status <> 'paid'/,
  );
});

test('Starter publication creates one idempotent account and email receipt', () => {
  assert.match(workOrderRepositorySource, /'email', 'starter-site-published'/);
  assert.match(workOrderRepositorySource, /starter-site-published:\$\{workOrder\.id\}/);
  assert.match(workOrderRepositorySource, /LEFT JOIN lmw_maintenance_subscriptions s/);
  assert.match(workOrderRepositorySource, /'maintenanceSubscriptionId', s\.id/);
  assert.match(workOrderRepositorySource, /'monthlyAmountCents', o\.monthly_amount_cents/);
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
  assert.match(wranglerSource, /MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED = "1"/);
  assert.match(wranglerSource, /MERCADO_PAGO_MAINTENANCE_TEST_MODE = "0"/);
});

test('commercial intake captures a contact/business brief so a build agent has real context', () => {
  const packageIntakeRepositorySource = readFileSync(
    new URL('../../../../packages/db/src/repositories/lmwares-package-intakes.ts', import.meta.url),
    'utf8',
  );
  const validationSource = readFileSync(
    new URL('../../../../packages/validation/src/package-intake.ts', import.meta.url),
    'utf8',
  );
  const domainModelSource = readFileSync(
    new URL('../../../../packages/domain/src/models/package-intake.ts', import.meta.url),
    'utf8',
  );
  const migrationSource = readFileSync(
    new URL('../../../../infra/d1/migrations/0028_lmwares_package_intake_brief.sql', import.meta.url),
    'utf8',
  );

  assert.match(migrationSource, /ADD COLUMN contact_name/);
  assert.match(migrationSource, /ADD COLUMN site_goal/);
  assert.match(validationSource, /packageIntakeBriefSchema/);
  assert.match(domainModelSource, /PackageIntakeBrief/);
  assert.match(packageIntakeRepositorySource, /contact_name/);
  assert.match(intakeSource, /input\.brief/);
  assert.match(
    workOrderRepositorySource,
    /json_patch\(\s*b\.order_snapshot,\s*json_object\(\s*'brief', json_object\(/,
  );
});
