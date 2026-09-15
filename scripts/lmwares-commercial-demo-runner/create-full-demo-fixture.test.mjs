import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const createScript = path.join(scriptDir, 'create-full-demo-fixture.mjs');
const clearScript = path.join(scriptDir, 'clear-initialization-fixture.mjs');
const runnerScript = path.join(scriptDir, 'cli.mjs');

test('full browser fixture has only fictional public context and can never be submitted', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-full-fixture-'));
  const active = path.join(root, 'control', 'active-run.json');
  const env = { ...process.env, LMWARES_DEMO_PROJECTS_ROOT: root, LMWARES_DEMO_ACTIVE_RUN_PATH: active };
  const created = await run(process.execPath, [createScript], { env });
  assert.match(created.stdout, /full_fixture_ready/);
  const fixture = JSON.parse(await readFile(active, 'utf8'));
  assert.equal(fixture.mode, 'production');
  assert.equal(fixture.fixture.submitAllowed, false);
  assert.match(fixture.runId, /^test_full_demo_/);
  assert.equal(fixture.generationManifest.manifest.informationArchitecture.routes.length, 4);
  assert.equal(fixture.generationManifest.manifest.assetSlots.length, 4);
  assert.equal(JSON.stringify(fixture).includes('contactPhone'), false);
  assert.equal(JSON.stringify(fixture).includes('implementationAmount'), false);
  const runnerSource = await readFile(runnerScript, 'utf8');
  assert.match(runnerSource, /isLocalBrowserFixture\(active\)/);
  assert.match(runnerSource, /run\.fixture\.submitAllowed === false/);
  await assert.rejects(run(process.execPath, [createScript], { env }), /Ya existe un run activo/);
  await run(process.execPath, [clearScript], { env });
  assert.equal((await readdir(path.dirname(active))).some((name) => name.startsWith('active-run.json.fixture-')), true);
});
