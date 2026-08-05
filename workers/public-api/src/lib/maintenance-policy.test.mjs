import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repositorySource = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-maintenance-subscriptions.ts', import.meta.url),
  'utf8',
);
const routeSource = readFileSync(new URL('../routes/maintenance-subscriptions.ts', import.meta.url), 'utf8');
const workOrderSource = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-starter-work-orders.ts', import.meta.url),
  'utf8',
);
const technicalSubscriptionSource = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-subscriptions.ts', import.meta.url),
  'utf8',
);

test('maintenance creation requires every commercial publication gate', () => {
  const claimStart = repositorySource.indexOf('async claimCreation');
  const claimEnd = repositorySource.indexOf('async savePreapproval');
  const claimSource = repositorySource.slice(claimStart, claimEnd);

  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  assert.match(claimSource, /w\.status = 'ready_to_publish'/);
  assert.match(claimSource, /w\.project_id IS NOT NULL/);
  assert.match(claimSource, /b\.status = 'paid'/);
  assert.match(claimSource, /b\.payment_review_required = 0/);
  assert.match(claimSource, /o\.status = 'accepted'/);
  assert.match(claimSource, /o\.monthly_amount_cents > 0/);
});

test('the remote maintenance switch is checked before reading provider credentials', () => {
  const handlerStart = routeSource.indexOf("maintenanceSubscriptions.post('/work-orders/:workOrderId'");
  const handlerEnd = routeSource.indexOf("maintenanceSubscriptions.post('/:id/reconcile'");
  const handlerSource = routeSource.slice(handlerStart, handlerEnd);

  const gateCheck = handlerSource.indexOf('assertMaintenanceEnabled(c.env)');
  const tokenRead = handlerSource.indexOf('maintenanceAccessToken(c.env)');
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.ok(gateCheck >= 0 && tokenRead > gateCheck);
});

test('publication remains gated by an active maintenance subscription', () => {
  const publishStart = workOrderSource.indexOf('async publish');
  const publishEnd = workOrderSource.indexOf('private async ensurePublishedNotifications');
  const publishSource = workOrderSource.slice(publishStart, publishEnd);

  assert.ok(publishStart >= 0 && publishEnd > publishStart);
  assert.match(publishSource, /current\.status !== 'ready_to_publish'/);
  assert.match(publishSource, /s\.status = 'active'/);
  assert.match(publishSource, /status = 'live'/);
});

test('provider reconciliation cannot race a canceled or disputed lifecycle back open', () => {
  for (const source of [repositorySource, technicalSubscriptionSource]) {
    const saveStart = source.indexOf('async savePreapproval');
    const saveEnd = source.indexOf('async markCreationFailed', saveStart);
    const saveSource = source.slice(saveStart, saveEnd);
    assert.ok(saveStart >= 0 && saveEnd > saveStart);
    assert.match(
      saveSource,
      /status = CASE WHEN status IN \('canceled', 'disputed'\) THEN status ELSE \? END/,
    );
    assert.match(saveSource, /status NOT IN \('canceled', 'disputed'\) AND \? = 'active'/);
  }
});

test('a live publication can recover its receipt after a concurrent cancellation', () => {
  const notificationStart = workOrderSource.indexOf('private async ensurePublishedNotifications');
  const notificationSource = workOrderSource.slice(notificationStart);
  assert.ok(notificationStart >= 0);
  assert.match(
    notificationSource,
    /LEFT JOIN lmw_maintenance_subscriptions s ON s\.work_order_id = w\.id AND s\.status = 'active'/,
  );
  assert.doesNotMatch(
    notificationSource,
    /(?<!LEFT )JOIN lmw_maintenance_subscriptions s ON s\.work_order_id = w\.id/,
  );
  assert.match(notificationSource, /starter-site-published:\$\{workOrder\.id\}/);
  assert.match(notificationSource, /INSERT OR IGNORE INTO lmw_notifications/);
});
