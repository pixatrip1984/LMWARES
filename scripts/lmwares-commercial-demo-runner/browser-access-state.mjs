import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ACCESS_STATES = new Set([
  'background-running', 'access-checking', 'human-required', 'interactive-wait',
  'access-restored', 'background-verifying', 'recovery-paused',
]);

export const ACCESS_CATEGORIES = new Set([
  'ready', 'challenge', 'login-required', 'access-denied', 'network-unavailable',
  'extension-unavailable', 'chat-unavailable', 'unknown',
]);

const SAFE_ID = /^[a-zA-Z0-9_-]{8,120}$/;
const SCHEMA_VERSION = 'lmwares.demo-browser-access.v1';

export function newBrowserAccessState(run, now = new Date()) {
  const runId = String(run?.runId || '');
  if (!SAFE_ID.test(runId)) throw new Error('El run no tiene una identidad válida para supervisar el acceso.');
  const at = iso(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    runId,
    executionGeneration: Number.isSafeInteger(run?.executionGeneration) ? run.executionGeneration : 0,
    state: 'background-verifying',
    category: 'unknown',
    recoveryId: crypto.randomUUID(),
    browserMode: String(run?.browserMode || 'isolated-desktop'),
    transition: null,
    openedInteractiveCount: 0,
    automaticCheckStartedAt: null,
    stableSince: null,
    lastObservedAt: null,
    lastError: null,
    createdAt: at,
    updatedAt: at,
  };
}

export function validateBrowserAccessState(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== SCHEMA_VERSION) throw new Error('El estado de acceso no usa el esquema esperado.');
  if (!SAFE_ID.test(String(value.runId || ''))) throw new Error('El estado de acceso no tiene runId válido.');
  if (!ACCESS_STATES.has(value.state) || !ACCESS_CATEGORIES.has(value.category)) throw new Error('El estado o categoría de acceso no es válido.');
  if (!Number.isSafeInteger(value.executionGeneration) || value.executionGeneration < 0) throw new Error('La generación de acceso no es válida.');
  if (!Number.isInteger(value.openedInteractiveCount) || value.openedInteractiveCount < 0 || value.openedInteractiveCount > 10) throw new Error('El contador de intervención no es válido.');
  return value;
}

export async function readBrowserAccessState(statePath) {
  try { return validateBrowserAccessState(JSON.parse(await readFile(statePath, 'utf8'))); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

export async function quarantineBrowserAccessState(statePath, now = new Date()) {
  try {
    await readFile(statePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const directory = path.join(path.dirname(statePath), 'corrupt-browser-access-states');
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const target = path.join(directory, `${path.basename(statePath)}.${stamp}.${process.pid}.corrupt`);
  await mkdir(directory, { recursive: true });
  await rename(statePath, target);
  return target;
}

export async function writeBrowserAccessState(statePath, next) {
  const valid = validateBrowserAccessState(next);
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`, 'utf8');
  await rename(temporary, statePath);
  return valid;
}

export function stateForRun(existing, run, now = new Date()) {
  if (!existing || existing.runId !== run?.runId || existing.executionGeneration !== Number(run?.executionGeneration || 0)) return newBrowserAccessState(run, now);
  return validateBrowserAccessState(existing);
}

function iso(now) { return new Date(now).toISOString(); }
