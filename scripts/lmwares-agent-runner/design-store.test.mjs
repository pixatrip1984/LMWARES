import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DesignStoreError,
  readLatestTargets,
  readTargetAsset,
  saveTargetAsset,
} from './design-store.mjs';

test('versiona y recupera únicamente el objetivo más reciente por pantalla', async (t) => {
  const designsRoot = await mkdtemp(path.join(os.tmpdir(), 'lmwares-targets-'));
  t.after(() => rm(designsRoot, { recursive: true, force: true }));
  const body = fakePng(1672, 941);

  const first = await saveTargetAsset({
    designsRoot,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    body,
    contentType: 'image/png',
    source: 'imagegen',
  });
  const second = await saveTargetAsset({
    designsRoot,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    body,
    contentType: 'image/png',
    source: 'uploaded',
  });

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  const latest = await readLatestTargets({ designsRoot, projectId: 'shynolaser.mx' });
  assert.equal(latest.targets.length, 1);
  assert.equal(latest.targets[0].version, 2);
  const asset = await readTargetAsset({ designsRoot, projectId: 'shynolaser.mx', screenId: 'catalog-home' });
  assert.deepEqual(asset.body, body);
});

test('mantiene versiones independientes para cada fotograma de una pantalla', async (t) => {
  const designsRoot = await mkdtemp(path.join(os.tmpdir(), 'lmwares-targets-'));
  t.after(() => rm(designsRoot, { recursive: true, force: true }));
  const body = fakePng(1672, 941);

  await saveTargetAsset({
    designsRoot,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    body,
    contentType: 'image/png',
    source: 'imagegen',
  });
  const secondFrame = await saveTargetAsset({
    designsRoot,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    frameId: 'audiencias',
    body,
    contentType: 'image/png',
    source: 'imagegen',
  });
  const secondFrameRevision = await saveTargetAsset({
    designsRoot,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    frameId: 'audiencias',
    body,
    contentType: 'image/png',
    source: 'uploaded',
  });

  assert.equal(secondFrame.version, 1);
  assert.equal(secondFrameRevision.version, 2);
  const latest = await readLatestTargets({ designsRoot, projectId: 'shynolaser.mx' });
  assert.equal(latest.targets.length, 2);
  assert.equal(latest.targets.find((target) => target.frameId === 'primary')?.version, 1);
  assert.equal(latest.targets.find((target) => target.frameId === 'audiencias')?.version, 2);
  const asset = await readTargetAsset({
    designsRoot,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    frameId: 'audiencias',
  });
  assert.equal(asset.target.frameId, 'audiencias');
  assert.match(asset.target.imagePath, /catalog-home[\\/]audiencias[\\/]v002\.png$/);
});

test('rechaza una carga cuyo tipo declarado no coincide con sus bytes', async (t) => {
  const designsRoot = await mkdtemp(path.join(os.tmpdir(), 'lmwares-targets-'));
  t.after(() => rm(designsRoot, { recursive: true, force: true }));
  await assert.rejects(
    () => saveTargetAsset({
      designsRoot,
      projectId: 'shynolaser.mx',
      screenId: 'catalog-home',
      body: fakePng(800, 600),
      contentType: 'image/jpeg',
      source: 'uploaded',
    }),
    (error) => error instanceof DesignStoreError && error.code === 'invalid_target_image',
  );
});

function fakePng(width, height) {
  const body = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(body, 0);
  body.writeUInt32BE(width, 16);
  body.writeUInt32BE(height, 20);
  return body;
}
