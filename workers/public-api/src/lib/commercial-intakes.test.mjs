import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const intakeSource = readFileSync(new URL('../routes/commercial-intakes.ts', import.meta.url), 'utf8');
const paymentsSource = readFileSync(new URL('../routes/payments.ts', import.meta.url), 'utf8');
const subscriptionsSource = readFileSync(new URL('../routes/subscriptions.ts', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const wranglerSource = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');

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
