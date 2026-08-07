import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./starter-domains.ts', import.meta.url), 'utf8');

test('domain search and purchase require an active maintenance plan before touching the registrar', () => {
  assert.match(source, /async function requireActiveMaintenance/);
  assert.match(source, /maintenancePlanSelected \?\? ''/);
  assert.match(source, /\['basic', 'advanced'\]\.includes/);
  assert.match(source, /await requireActiveMaintenance\(repos, clientProjectId, session\.user\.id\)/g);
});

test('the search endpoint never purchases, only checks availability', () => {
  const searchStart = source.indexOf("starterDomains.post('/:clientProjectId/domains/search'");
  const purchaseStart = source.indexOf("starterDomains.post('/:clientProjectId/domains/purchase'");
  assert.ok(searchStart >= 0 && purchaseStart > searchStart);
  const searchHandler = source.slice(searchStart, purchaseStart);
  assert.match(searchHandler, /registrar\.checkAvailability\(/);
  assert.doesNotMatch(searchHandler, /registrar\.purchase\(/);
  assert.doesNotMatch(searchHandler, /registrar\.setDnsRecords\(/);
});

test('purchase is idempotent by client project and by hostname before calling Namesilo', () => {
  const purchaseStart = source.indexOf("starterDomains.post('/:clientProjectId/domains/purchase'");
  const purchaseHandler = source.slice(purchaseStart);
  const purchaseCallIndex = purchaseHandler.indexOf('registrar.purchase(');

  assert.ok(purchaseCallIndex > 0);
  const beforePurchase = purchaseHandler.slice(0, purchaseCallIndex);
  assert.match(beforePurchase, /existingApex/);
  assert.match(beforePurchase, /getByHostname\(input\.domain\)/);
});

test('a successful purchase reuses the existing Cloudflare register() flow and records the registrar order id', () => {
  assert.match(source, /provider\.register\(\{\s*hostname: input\.domain,/);
  assert.match(source, /toRegistrarDnsRecords\(input\.domain, registration\.instructions\)/);
  assert.match(source, /type: 'apex'/);
  assert.match(source, /registrar: registrar\.name,\s*registrarOrderId: purchase\.orderId,/);
  assert.match(source, /action: 'lmwares\.custom_domain\.namesilo_purchase'/);
});

test('the registrar API key never appears in the route source', () => {
  assert.doesNotMatch(source, /NAMESILO_API_KEY/);
});
