import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const intakeSource = readFileSync(new URL('../routes/commercial-intakes.ts', import.meta.url), 'utf8');
const paymentsSource = readFileSync(new URL('../routes/payments.ts', import.meta.url), 'utf8');
const subscriptionsSource = readFileSync(new URL('../routes/subscriptions.ts', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const wranglerSource = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../routes/account.ts', import.meta.url), 'utf8');
const offersSource = readFileSync(new URL('../lib/commercial-offer-public.ts', import.meta.url), 'utf8');

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
