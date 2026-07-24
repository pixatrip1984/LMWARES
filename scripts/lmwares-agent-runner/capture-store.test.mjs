import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CaptureStoreError,
  readCaptureAsset,
  readCaptureManifest,
  saveCaptureAsset,
} from './capture-store.mjs';

test('expone únicamente capturas declaradas dentro del almacén visual', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-captures-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'shynolaser.mx', 'captures', 'current');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'catalog-home.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: 'shynolaser.mx',
      source: 'browser-real',
      baseUrl: 'http://127.0.0.1:5173',
      capturedAt: '2026-07-18T00:00:00.000Z',
      captures: [
        {
          screenId: 'catalog-home',
          route: '/',
          file: 'catalog-home.jpg',
          width: 1265,
          height: 3341,
          capturedAt: '2026-07-18T00:00:00.000Z',
        },
      ],
    }),
  );

  const manifest = await readCaptureManifest({ designsRoot: root, projectId: 'shynolaser.mx' });
  assert.equal(manifest.captures.length, 1);
  assert.equal(manifest.captures[0].frameId, 'primary');
  assert.equal(manifest.captures[0].imagePath, path.join(directory, 'catalog-home.jpg'));
  const asset = await readCaptureAsset({
    designsRoot: root,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
  });
  assert.equal(asset.contentType, 'image/jpeg');
  assert.equal(asset.body.length, 4);
});

test('guarda capturas independientes para cada fotograma visual', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-capture-frames-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const body = Buffer.from([0xff, 0xd8, 1, 2, 3, 4, 5, 6, 0xff, 0xd9]);

  await saveCaptureAsset({
    designsRoot: root,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    frameId: 'creadores',
    route: '/',
    body,
    contentType: 'image/jpeg',
    width: 1280,
    height: 720,
    baseUrl: 'http://127.0.0.1:5173',
  });

  const manifest = await readCaptureManifest({ designsRoot: root, projectId: 'shynolaser.mx' });
  assert.equal(manifest.captures[0].frameId, 'creadores');
  assert.match(manifest.captures[0].imagePath, /catalog-home--creadores--.+\.jpg$/);
  const asset = await readCaptureAsset({
    designsRoot: root,
    projectId: 'shynolaser.mx',
    screenId: 'catalog-home',
    frameId: 'creadores',
  });
  assert.deepEqual(asset.body, body);
});

test('rechaza rutas de imagen que intenten salir del almacén', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-captures-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'shynolaser.mx', 'captures', 'current');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: 'shynolaser.mx',
      captures: [
        {
          screenId: 'catalog-home',
          route: '/',
          file: '../escape.jpg',
          width: 100,
          height: 100,
          capturedAt: '2026-07-18T00:00:00.000Z',
        },
      ],
    }),
  );

  await assert.rejects(
    readCaptureManifest({ designsRoot: root, projectId: 'shynolaser.mx' }),
    (error) => error instanceof CaptureStoreError && error.code === 'invalid_capture_manifest',
  );
});
