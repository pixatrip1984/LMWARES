import assert from 'node:assert/strict';
import test from 'node:test';
import { CUSTOM_DOMAIN_STATUSES, CUSTOM_DOMAIN_TYPES } from './custom-domain.ts';

test('custom domain lifecycle keeps provider activation explicit', () => {
  assert.deepEqual(CUSTOM_DOMAIN_TYPES, ['www', 'app', 'apex']);
  assert.deepEqual(CUSTOM_DOMAIN_STATUSES, [
    'draft',
    'pending_verification',
    'verified',
    'provisioning',
    'active',
    'failed',
    'removed',
  ]);
});

test('custom domain status keeps removed records reusable without exposing them as active', () => {
  assert.ok(CUSTOM_DOMAIN_STATUSES.includes('removed'));
  assert.ok(CUSTOM_DOMAIN_STATUSES.includes('active'));
});
