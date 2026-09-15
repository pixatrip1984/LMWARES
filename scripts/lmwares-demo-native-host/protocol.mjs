import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const JOB_ID = /^[a-zA-Z0-9_-]{8,120}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;

export async function stageDownloadedArtifact(message, config) {
  if (!message || message.type !== 'stage-download') throw new Error('Mensaje Native Messaging no permitido.');
  const jobId = String(message.jobId ?? '');
  const runId = String(message.runId ?? '');
  const sourceName = String(message.sourceName ?? '');
  const expectedHash = String(message.sha256 ?? '').toLowerCase();
  if (!JOB_ID.test(jobId) || !JOB_ID.test(runId) || !/^[a-zA-Z0-9._-]+\.zip$/i.test(sourceName) || !SHA256.test(expectedHash)) {
    throw new Error('La entrega no tiene identidad, nombre o hash válidos.');
  }
  const incomingRoot = await resolvedRoot(config.incomingRoot, 'incomingRoot');
  const stagingRoot = await resolvedRoot(config.stagingRoot, 'stagingRoot');
  const sourcePath = path.resolve(incomingRoot, sourceName);
  if (!isWithin(incomingRoot, sourcePath)) throw new Error('La descarga sale de la carpeta autorizada.');
  const source = await stat(sourcePath);
  if (!source.isFile() || source.size <= 0 || source.size > MAX_ARCHIVE_BYTES) throw new Error('El ZIP excede el límite o no existe.');
  const actualHash = await sha256File(sourcePath);
  if (actualHash !== expectedHash) throw new Error('El hash de la descarga no coincide.');
  const targetDir = path.resolve(stagingRoot, jobId, runId);
  if (!isWithin(stagingRoot, targetDir)) throw new Error('El staging calculado no es válido.');
  await mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, 'delivery.zip');
  try {
    const existing = await stat(targetPath);
    if (!existing.isFile() || await sha256File(targetPath) !== expectedHash) throw new Error('Ya existe una entrega distinta para este job/run; no se sobrescribe.');
    return { ok: true, recovered: true, receiptId: randomUUID(), jobId, runId, stagedPath: targetPath, sha256: expectedHash, bytes: existing.size };
  } catch (error) {
    if (!(error && error.code === 'ENOENT')) throw error;
  }
  await copyFile(sourcePath, targetPath);
  const copiedHash = await sha256File(targetPath);
  if (copiedHash !== expectedHash) throw new Error('La copia en staging perdió integridad.');
  return { ok: true, receiptId: randomUUID(), jobId, runId, stagedPath: targetPath, sha256: copiedHash, bytes: source.size };
}

async function resolvedRoot(value, name) {
  if (!value) throw new Error(`Falta ${name}.`);
  await mkdir(value, { recursive: true });
  return realpath(value);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function sha256File(filePath) {
  const { createReadStream } = await import('node:fs');
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject); hash.on('error', reject);
    hash.on('finish', () => resolve(hash.digest('hex')));
    stream.pipe(hash);
  });
}
