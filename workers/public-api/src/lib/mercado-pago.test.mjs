import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const providerSource = readFileSync(new URL('./mercado-pago.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../routes/subscriptions.ts', import.meta.url), 'utf8');

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
    /publicHttpsUrl\(\s*input\.publicApiUrl,\s*'\/payments\/webhooks\/mercado-pago'/,
  );
  assert.match(preapprovalSource, /notification_url: notificationUrl/);
  assert.match(routeSource, /publicApiUrl: c\.env\.PUBLIC_API_URL/);
});
