import { access, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';

const SAFE_ID = /^[a-zA-Z0-9_-]{8,120}$/;
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp)$/i;
const RECOVERABLE_BROWSER_STATES = new Set([
  '', 'opening-chat', 'initializing-chat', 'refreshing-chat', 'checking-chat', 'bridge-unavailable', 'ready',
]);
const BROWSER_MODES = new Set(['headless', 'interactive', 'isolated-desktop']);

export function browserModeForRun(run, configuredMode = 'isolated-desktop') {
  const candidate = String(run?.browserMode || configuredMode || '').toLowerCase();
  return BROWSER_MODES.has(candidate) ? candidate : 'isolated-desktop';
}

export function defaultRunnerId(machineName = hostname()) {
  const safeHost = String(machineName || 'local').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'local';
  return `local-commercial-demo-${safeHost}`;
}

export function runnerIdForRun(run, configuredRunnerId = '') {
  const persisted = String(run?.runnerId || '');
  if (SAFE_ID.test(persisted)) return persisted;
  return configuredRunnerId || defaultRunnerId();
}

export function shouldLaunchBrowser(run, now = Date.now(), retryMs = 60_000) {
  if (!run || run.fixture || run.status === 'submitted_for_review') return false;
  if (run.browserLaunch?.launchedAt) {
    const studioStatus = String(run.studioStatus || '');
    if (!RECOVERABLE_BROWSER_STATES.has(studioStatus)) return false;
    const observedAt = Date.parse(String(run.studioUpdatedAt || run.browserLaunch.launchedAt));
    return Number.isFinite(observedAt) && now - observedAt >= retryMs;
  }
  const attemptedAt = Date.parse(String(run.browserLaunch?.attemptedAt || ''));
  return !Number.isFinite(attemptedAt) || now - attemptedAt >= retryMs;
}

export async function findCompleteIncomingOutput(run, incomingRoot) {
  if (!run?.runId || !run?.generationManifest?.manifest || run.fixture) return null;
  const candidates = [
    path.join(incomingRoot, run.runId),
    path.join(incomingRoot, 'LMWARES-DEMO-INCOMING', run.runId),
  ];
  const existing = [];
  for (const candidate of candidates) {
    if (await isFile(path.join(candidate, 'creative-plan.json'))) existing.push(candidate);
  }
  if (existing.length > 1) throw new Error('Hay dos carpetas de descargas para este run; resuelve la ambigüedad antes de ensamblar.');
  if (!existing.length) return null;
  const directory = existing[0];
  if (!await isFile(path.join(directory, 'code-package.json'))) return null;
  const assetDirectory = path.join(directory, 'assets');
  let files;
  try { files = await readdir(assetDirectory); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  const expectedAssets = run.generationManifest.manifest.assetSlots;
  if (!Array.isArray(expectedAssets) || !expectedAssets.length) throw new Error('El manifiesto creativo no contiene assets autorizados.');
  for (const asset of expectedAssets) {
    const escaped = String(asset.id || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped || !files.some((file) => new RegExp(`^${escaped}${IMAGE_EXTENSION.source}`, 'i').test(file))) return null;
  }
  return directory;
}

export async function updateActiveRun(activeRunPath, expectedRunId, patch) {
  const current = JSON.parse(await readFile(activeRunPath, 'utf8'));
  if (current.runId !== expectedRunId) throw new Error('El run activo cambió durante la operación local.');
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(activeRunPath, next);
  return next;
}

export async function archiveCompletedRun(activeRunPath, run) {
  const directory = path.join(path.dirname(activeRunPath), 'completed-runs');
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${run.runId}.json`);
  try {
    await access(target);
    const existing = JSON.parse(await readFile(target, 'utf8'));
    if (existing.runId !== run.runId || existing.jobId !== run.jobId) throw new Error('El archivo histórico del run no coincide.');
    await rename(activeRunPath, `${activeRunPath}.${process.pid}.completed`);
    return target;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await rename(activeRunPath, target);
  return target;
}

export async function archiveAbandonedRun(activeRunPath, run) {
  const directory = path.join(path.dirname(activeRunPath), 'abandoned-runs');
  await mkdir(directory, { recursive: true });
  const generation = Number.isSafeInteger(run.executionGeneration) ? run.executionGeneration : 0;
  const target = path.join(directory, `${run.runId}-generation-${generation}.json`);
  try {
    await access(target);
    const existing = JSON.parse(await readFile(target, 'utf8'));
    if (existing.runId !== run.runId || existing.jobId !== run.jobId) throw new Error('El intento abandonado no coincide con el historial local.');
    await rename(activeRunPath, `${activeRunPath}.${process.pid}.abandoned`);
    return target;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await rename(activeRunPath, target);
  return target;
}

async function isFile(file) {
  try { return (await stat(file)).isFile(); } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

async function writeJsonAtomic(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
}
