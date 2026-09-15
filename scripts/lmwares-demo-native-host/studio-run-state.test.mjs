import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readPublicActiveRun, updateStudioProgress } from './studio-run-state.mjs';

test('bridge reports progress without exposing or replacing lease authority', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-studio-state-'));
  const target = path.join(root, 'active-run.json');
  const original = {
    runId: 'run_demo_123', status: 'awaiting_chat', jobId: 'job_demo_123', executionGeneration: 4,
    leaseToken: 'private-token-value',
    generationManifest: { id: 'manifest_demo', digest: 'a'.repeat(64), schemaVersion: 'v1', manifest: { assetSlots: [] } },
  };
  await writeFile(target, JSON.stringify(original));
  updateStudioProgress(target, { runId: original.runId, executionGeneration: 4, status: 'creative-plan-generating', message: 'Trabajando\ncon el plan.' });
  const stored = JSON.parse(await readFile(target, 'utf8'));
  assert.equal(stored.status, 'awaiting_chat');
  assert.equal(stored.studioStatus, 'creative-plan-generating');
  assert.equal(stored.studioMessage, 'Trabajando con el plan.');
  assert.equal(stored.leaseToken, original.leaseToken);
  const publicRun = readPublicActiveRun(target);
  assert.equal(publicRun.status, 'creative-plan-generating');
  assert.equal(publicRun.executionGeneration, 4);
  assert.equal(publicRun.executionMode, 'interactive');
  assert.equal('leaseToken' in publicRun, false);
});

test('bridge exposes headless execution mode without exposing the run internals', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-studio-mode-'));
  const target = path.join(root, 'active-run.json');
  await writeFile(target, JSON.stringify({
    runId: 'run_demo_123', browserMode: 'headless', leaseToken: 'private-token-value',
    generationManifest: { id: 'manifest_demo', digest: 'a'.repeat(64), manifest: {} },
  }));
  const publicRun = readPublicActiveRun(target);
  assert.equal(publicRun.executionMode, 'headless');
  assert.equal('leaseToken' in publicRun, false);
});

test('bridge rejects cross-run and arbitrary statuses', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-studio-state-'));
  const target = path.join(root, 'active-run.json');
  await writeFile(target, JSON.stringify({ runId: 'run_demo_123', generationManifest: { id: 'manifest_demo', digest: 'a'.repeat(64), manifest: {} } }));
  assert.throws(() => updateStudioProgress(target, { runId: 'other_run_123', executionGeneration: 0, status: 'output-ready' }), /otro run/);
  assert.throws(() => updateStudioProgress(target, { runId: 'run_demo_123', executionGeneration: 1, status: 'output-ready' }), /otra generación/);
  assert.throws(() => updateStudioProgress(target, { runId: 'run_demo_123', executionGeneration: 0, status: 'submitted_for_review' }), /no es válido/);
});
