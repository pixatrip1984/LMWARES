import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CaptureServiceError, createCaptureService } from './capture-service.mjs';

test('impide que el capturador navegue fuera de loopback', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-capture-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = createCaptureService({
    designsRoot: root,
    browserExecutable: 'C:\\browser-fixture.exe',
    launch: async () => {
      throw new Error('El navegador no debe abrirse para una URL rechazada.');
    },
  });

  await assert.rejects(
    service.capture('shynolaser.mx', {
      screenId: 'catalog-home',
      route: '/',
      baseUrl: 'https://example.com/',
    }),
    (error) => error instanceof CaptureServiceError && error.code === 'capture_base_url_not_local',
  );
});
