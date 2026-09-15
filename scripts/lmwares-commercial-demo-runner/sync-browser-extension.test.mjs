import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('extension synchronizer verifies the worker without opening a persistent supervisor tab', async () => {
  const source = await readFile(path.resolve('scripts/lmwares-commercial-demo-runner/sync-browser-extension.mjs'), 'utf8');
  assert.match(source, /service_worker/);
  assert.match(source, /closePersistentSupervisorTabs/);
  assert.doesNotMatch(source, /async function openSupervisor/);
  assert.doesNotMatch(source, /const supervisorUrl/);
  assert.doesNotMatch(source, /\/json\/new\?/);
});
