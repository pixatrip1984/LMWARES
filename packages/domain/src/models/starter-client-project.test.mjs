import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTER_CLIENT_PROJECT_STATUSES } from './starter-client-project.ts';

test('starter client project statuses cover the client-facing site lifecycle', () => {
  assert.deepEqual(STARTER_CLIENT_PROJECT_STATUSES, ['provisioning', 'active', 'archived']);
});
