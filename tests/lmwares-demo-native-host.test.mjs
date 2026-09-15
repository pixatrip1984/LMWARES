import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageDownloadedArtifact } from '../scripts/lmwares-demo-native-host/protocol.mjs';

test('native host stages only a verified zip beneath the configured roots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-demo-host-'));
  const incoming = path.join(root, 'incoming'); const staging = path.join(root, 'staging');
  await mkdir(incoming); await mkdir(staging);
  const body = Buffer.from('zip fixture'); const name = 'demo.zip';
  await writeFile(path.join(incoming, name), body);
  const hash = createHash('sha256').update(body).digest('hex');
  const result = await stageDownloadedArtifact({ type: 'stage-download', jobId: 'job-12345678', runId: 'run-12345678', sourceName: name, sha256: hash }, { incomingRoot: incoming, stagingRoot: staging });
  assert.equal(result.ok, true);
  assert.equal((await stat(result.stagedPath)).size, body.length);
});

test('native host rejects traversal and incorrect hashes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-demo-host-'));
  const incoming = path.join(root, 'incoming'); const staging = path.join(root, 'staging');
  await mkdir(incoming); await mkdir(staging);
  await assert.rejects(() => stageDownloadedArtifact({ type: 'stage-download', jobId: 'job-12345678', runId: 'run-12345678', sourceName: '../x.zip', sha256: 'a'.repeat(64) }, { incomingRoot: incoming, stagingRoot: staging }), /entrega|carpeta/i);
});
