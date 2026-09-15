import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('scripts/lmwares-commercial-demo-runner');

test('isolated desktop launcher keeps a graphical browser outside the operator desktop', async () => {
  const [host, runner, launcher] = await Promise.all([
    readFile(path.join(root, 'isolated-desktop-host.cs'), 'utf8'),
    readFile(path.join(root, 'run-isolated-desktop.ps1'), 'utf8'),
    readFile(path.join(root, 'start-brave-demo-studio.ps1'), 'utf8'),
  ]);
  assert.match(host, /CreateDesktop/);
  assert.match(host, /CreateProcess/);
  assert.match(host, /WaitForSingleObject/);
  assert.match(runner, /LaunchAndWait/);
  assert.match(launcher, /isolated-desktop/);
  assert.match(launcher, /run-isolated-desktop\.ps1/);
});
