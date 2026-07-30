import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const providerSource = readFileSync(new URL('./mercado-pago.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../routes/subscriptions.ts', import.meta.url), 'utf8');
const paymentsRouteSource = readFileSync(
  new URL('../routes/payments.ts', import.meta.url),
  'utf8',
);

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

test('subscription simulator probes require a valid signature and never become billing events', () => {
  const handlerStart = paymentsRouteSource.indexOf(
    'async function handleSubscriptionAuthorizedPaymentWebhook',
  );
  const handlerEnd = paymentsRouteSource.indexOf(
    'async function validateSignedWebhook',
  );
  const handlerSource = paymentsRouteSource.slice(handlerStart, handlerEnd);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handlerSource, /MERCADO_PAGO_TEST_MODE === '1'/);
  assert.match(
    handlerSource,
    /const probeDataId = await readMercadoPagoSubscriptionProbeDataId\(c\)/,
  );
  assert.match(
    handlerSource,
    /const probeSignature = await validateSignedWebhook\(c, webhookSecrets, probeDataId\)/,
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
