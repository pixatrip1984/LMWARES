import assert from 'node:assert/strict';
import test from 'node:test';
import {
  subscriptionStatusFromCharge,
  subscriptionStatusFromProvider,
} from './subscription-policy.ts';

test('maps Mercado Pago preapproval states to internal states', () => {
  assert.equal(subscriptionStatusFromProvider('pending'), 'pending_authorization');
  assert.equal(subscriptionStatusFromProvider('authorized'), 'active');
  assert.equal(subscriptionStatusFromProvider('paused'), 'paused');
  assert.equal(subscriptionStatusFromProvider('cancelled'), 'canceled');
  assert.equal(subscriptionStatusFromProvider('unexpected'), 'payment_attention');
});

test('does not downgrade an active subscription for a scheduled charge', () => {
  assert.equal(subscriptionStatusFromCharge('scheduled', null, 'active'), 'active');
});

test('maps charge outcomes without hiding disputes', () => {
  assert.equal(subscriptionStatusFromCharge('processed', 'approved', 'active'), 'active');
  assert.equal(
    subscriptionStatusFromCharge('processed', 'rejected', 'active'),
    'payment_attention',
  );
  assert.equal(subscriptionStatusFromCharge('processed', 'charged_back', 'active'), 'disputed');
});
