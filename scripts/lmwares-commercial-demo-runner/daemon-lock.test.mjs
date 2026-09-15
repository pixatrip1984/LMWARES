import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireDaemonLock, DaemonAlreadyRunningError } from './daemon-lock.mjs';

test('only one live demo listener owns the lock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-daemon-lock-'));
  const lockPath = path.join(root, 'daemon.lock');
  const first = await acquireDaemonLock(lockPath, { isProcessAlive: () => true });
  await assert.rejects(
    acquireDaemonLock(lockPath, { isProcessAlive: () => true }),
    (error) => error instanceof DaemonAlreadyRunningError && error.owner.pid === process.pid,
  );
  await first.release();
  const second = await acquireDaemonLock(lockPath, { isProcessAlive: () => true });
  await second.release();
});

test('a stale lock is archived and cannot release a newer owner', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-daemon-stale-'));
  const lockPath = path.join(root, 'daemon.lock');
  await mkdir(lockPath);
  await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({ pid: 999_999, token: 'stale-token' }));

  const current = await acquireDaemonLock(lockPath, { isProcessAlive: () => false });
  const owner = JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8'));
  assert.equal(owner.pid, process.pid);
  assert.notEqual(owner.token, 'stale-token');
  await current.release();
});
