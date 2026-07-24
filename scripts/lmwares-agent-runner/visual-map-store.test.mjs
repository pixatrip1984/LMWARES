import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readVisualMap, saveVisualMap, VisualMapStoreError } from './visual-map-store.mjs';

test('persiste un mapa visual compartido sin rutas transitorias', async (t) => {
  const designsRoot = await mkdtemp(path.join(os.tmpdir(), 'lmwares-map-'));
  t.after(() => rm(designsRoot, { recursive: true, force: true }));
  const screens = [{ id: 'catalog-home', title: 'Catálogo', route: '/', frames: [] }];

  await saveVisualMap({
    designsRoot,
    projectId: 'shynolaser.mx',
    selectedScreenId: 'catalog-home',
    screens,
  });

  const stored = await readVisualMap({ designsRoot, projectId: 'shynolaser.mx' });
  assert.equal(stored.selectedScreenId, 'catalog-home');
  assert.deepEqual(stored.screens, screens);
});

test('rechaza rutas de imágenes enviadas por el navegador', async (t) => {
  const designsRoot = await mkdtemp(path.join(os.tmpdir(), 'lmwares-map-'));
  t.after(() => rm(designsRoot, { recursive: true, force: true }));

  await assert.rejects(
    () => saveVisualMap({
      designsRoot,
      projectId: 'shynolaser.mx',
      selectedScreenId: 'catalog-home',
      screens: [{ id: 'catalog-home', currentImagePath: 'C:\\private\\capture.png' }],
    }),
    (error) => error instanceof VisualMapStoreError && error.code === 'invalid_visual_map',
  );
});
