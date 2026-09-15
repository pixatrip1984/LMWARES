import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export class DaemonAlreadyRunningError extends Error {
  constructor(owner = null) {
    const suffix = owner?.pid ? ` (PID ${owner.pid})` : '';
    super(`Ya existe un listener de demos LMWares activo${suffix}.`);
    this.name = 'DaemonAlreadyRunningError';
    this.owner = owner;
  }
}

export async function acquireDaemonLock(lockPath, options = {}) {
  const token = randomUUID();
  const ownerPath = path.join(lockPath, 'owner.json');
  const owner = {
    schemaVersion: 'lmwares.demo-runner-lock.v1',
    pid: process.pid,
    token,
    startedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await mkdir(lockPath);
      await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      return createHandle(lockPath, ownerPath, owner);
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
        throw error;
      }

      const existing = await readOwner(ownerPath);
      const isAlive = await (options.isProcessAlive ?? isProcessAlive)(existing?.pid);
      if (isAlive) throw new DaemonAlreadyRunningError(existing);

      const stalePath = `${lockPath}.stale-${Date.now()}-${process.pid}-${attempt}`;
      try {
        await rename(lockPath, stalePath);
      } catch (renameError) {
        if (renameError?.code === 'ENOENT' || renameError?.code === 'EEXIST') continue;
        throw renameError;
      }
    }
  }

  throw new Error('No se pudo adquirir el lock único del listener de demos.');
}

async function readOwner(ownerPath) {
  try {
    return JSON.parse(await readFile(ownerPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function createHandle(lockPath, ownerPath, owner) {
  let released = false;
  return {
    owner,
    async release() {
      if (released) return;
      released = true;
      const current = await readOwner(ownerPath);
      if (current?.token !== owner.token) return;
      await rm(lockPath, { recursive: true, force: true });
    },
  };
}
