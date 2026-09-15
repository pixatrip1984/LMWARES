import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  archiveAbandonedRun,
  browserModeForRun,
  defaultRunnerId,
  findCompleteIncomingOutput,
  runnerIdForRun,
  shouldLaunchBrowser,
} from './runner-automation.mjs';

const run = {
  runId: 'run_12345678',
  status: 'awaiting_chat',
  generationManifest: { manifest: { assetSlots: [{ id: 'hero' }, { id: 'detail' }] } },
};

test('runner identity is stable across process restarts and honors the persisted lease owner', () => {
  assert.equal(defaultRunnerId('DELL OFFICE'), 'local-commercial-demo-dell-office');
  assert.equal(runnerIdForRun({ runnerId: 'local-commercial-demo-18420' }, 'new-runner'), 'local-commercial-demo-18420');
  assert.equal(runnerIdForRun({}, 'configured-runner'), 'configured-runner');
});

test('browser execution mode defaults to the isolated desktop and preserves only an explicit valid run mode', () => {
  assert.equal(browserModeForRun({}, 'isolated-desktop'), 'isolated-desktop');
  assert.equal(browserModeForRun({ browserMode: 'interactive' }, 'headless'), 'interactive');
  assert.equal(browserModeForRun({ browserMode: 'unknown' }, 'interactive'), 'isolated-desktop');
});

test('browser launches once and retries only failed attempts after the cooldown', () => {
  assert.equal(shouldLaunchBrowser(run, 100_000, 60_000), true);
  assert.equal(shouldLaunchBrowser({ ...run, studioStatus: 'opening-chat', studioUpdatedAt: new Date(1).toISOString(), browserLaunch: { launchedAt: new Date(1).toISOString() } }, 100_000, 60_000), true);
  assert.equal(shouldLaunchBrowser({ ...run, studioStatus: 'opening-chat', studioUpdatedAt: new Date(80_000).toISOString(), browserLaunch: { launchedAt: new Date(1).toISOString() } }, 100_000, 60_000), false);
  assert.equal(shouldLaunchBrowser({ ...run, studioStatus: 'creative-plan-generating', studioUpdatedAt: new Date(1).toISOString(), browserLaunch: { launchedAt: new Date(1).toISOString() } }, 100_000, 60_000), false);
  assert.equal(shouldLaunchBrowser({ ...run, browserLaunch: { attemptedAt: new Date(80_000).toISOString() } }, 100_000, 60_000), false);
  assert.equal(shouldLaunchBrowser({ ...run, browserLaunch: { attemptedAt: new Date(20_000).toISOString() } }, 100_000, 60_000), true);
  assert.equal(shouldLaunchBrowser({ ...run, fixture: { submitAllowed: false } }, 100_000, 60_000), false);
});

test('download readiness waits for code and every authorized local image', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-runner-ready-'));
  const incoming = path.join(root, 'LMWARES-DEMO-INCOMING', run.runId);
  await mkdir(path.join(incoming, 'assets'), { recursive: true });
  await writeFile(path.join(incoming, 'creative-plan.json'), '{}');
  assert.equal(await findCompleteIncomingOutput(run, root), null);
  await writeFile(path.join(incoming, 'code-package.json'), '{}');
  await writeFile(path.join(incoming, 'assets', 'hero.png'), 'hero');
  assert.equal(await findCompleteIncomingOutput(run, root), null);
  await writeFile(path.join(incoming, 'assets', 'detail.webp'), 'detail');
  assert.equal(await findCompleteIncomingOutput(run, root), incoming);
});

test('ambiguous download roots are rejected instead of mixing deliveries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-runner-ambiguous-'));
  for (const incoming of [path.join(root, run.runId), path.join(root, 'LMWARES-DEMO-INCOMING', run.runId)]) {
    await mkdir(incoming, { recursive: true });
    await writeFile(path.join(incoming, 'creative-plan.json'), '{}');
  }
  await assert.rejects(findCompleteIncomingOutput(run, root), /dos carpetas/);
});

test('a lost lease archives its exact fenced attempt before the queue continues', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-runner-abandoned-'));
  const activeRunPath = path.join(root, 'control', 'active-run.json');
  const lost = { ...run, jobId: 'job_12345678', executionGeneration: 3, status: 'lease_lost' };
  await mkdir(path.dirname(activeRunPath), { recursive: true });
  await writeFile(activeRunPath, JSON.stringify(lost));
  const target = await archiveAbandonedRun(activeRunPath, lost);
  assert.match(target.replaceAll('\\', '/'), /abandoned-runs\/run_12345678-generation-3\.json$/);
  assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), lost);
  await assert.rejects(access(activeRunPath), /ENOENT/);
});
