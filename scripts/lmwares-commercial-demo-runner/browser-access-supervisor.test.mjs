import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyBrowserSurface } from './browser-access-probe.mjs';
import { newBrowserAccessState, quarantineBrowserAccessState, readBrowserAccessState, writeBrowserAccessState } from './browser-access-state.mjs';
import { completeBrowserTransition, decideBrowserAccess, superviseBrowserAccess } from './browser-access-supervisor.mjs';

const run = { runId: 'run_demo_123', executionGeneration: 3, browserMode: 'isolated-desktop' };
const started = new Date('2026-09-15T10:00:00.000Z');

test('access probe distinguishes a blocking challenge from a ready composer without reading page content', () => {
  const challenge = classifyBrowserSurface({ title: 'Just a moment...', pathname: '/', challengeFrame: true, composer: false });
  assert.equal(challenge.category, 'challenge');
  assert.equal(challenge.surface.composer, false);
  assert.equal('bodyText' in challenge.surface, false);
  const ready = classifyBrowserSurface({ title: 'ChatGPT', pathname: '/c/demo', composer: true });
  assert.equal(ready.category, 'ready');
  assert.equal(ready.confidence, 'high');
});

test('a challenge waits for automatic resolution then opens one interactive recovery only', () => {
  const initial = newBrowserAccessState(run, started);
  const challenge = { category: 'challenge', message: 'Verificación requerida.' };
  const first = decideBrowserAccess(initial, challenge, new Date(started.getTime() + 1_000));
  assert.equal(first.action, 'wait');
  assert.equal(first.state.state, 'access-checking');
  const second = decideBrowserAccess(first.state, challenge, new Date(started.getTime() + 46_000));
  assert.equal(second.action, 'open-interactive');
  assert.equal(second.state.openedInteractiveCount, 1);
  const third = decideBrowserAccess(second.state, challenge, new Date(started.getTime() + 90_000));
  assert.equal(third.action, 'pause');
  assert.equal(third.state.state, 'recovery-paused');
});

test('interactive access must remain ready for the stability window before background return', () => {
  const initial = { ...newBrowserAccessState(run, started), state: 'interactive-wait' };
  const ready = { category: 'ready', message: 'Disponible.' };
  const first = decideBrowserAccess(initial, ready, new Date(started.getTime() + 1_000));
  assert.equal(first.action, 'none');
  const stable = decideBrowserAccess(first.state, ready, new Date(started.getTime() + 12_000));
  assert.equal(stable.action, 'return-background');
  assert.equal(stable.state.state, 'access-restored');
});

test('a successful transition records the next mode before another poll can act', () => {
  const initial = { ...newBrowserAccessState(run, started), state: 'human-required' };
  const next = completeBrowserTransition(initial, 'open-interactive', { transitioned: true }, new Date(started.getTime() + 1_000));
  assert.equal(next.state, 'interactive-wait');
  assert.equal(next.transition, null);
});

test('browser access state is atomically persisted and fenced by run generation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-browser-access-'));
  const target = path.join(root, 'browser-access-state.json');
  const state = newBrowserAccessState(run, started);
  await writeBrowserAccessState(target, state);
  assert.deepEqual(await readBrowserAccessState(target), state);
  const raw = JSON.parse(await readFile(target, 'utf8'));
  assert.equal(raw.runId, run.runId);
  assert.equal(raw.executionGeneration, 3);
});

test('corrupt access state is quarantined instead of becoming a permanent null monitor result', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-browser-access-corrupt-'));
  const target = path.join(root, 'browser-access-state.json');
  await (await import('node:fs/promises')).writeFile(target, Buffer.alloc(64));
  await assert.rejects(readBrowserAccessState(target));
  const evidence = await quarantineBrowserAccessState(target, started);
  assert.match(evidence, /corrupt-browser-access-states/);
  await assert.rejects((await import('node:fs/promises')).access(target));
});
