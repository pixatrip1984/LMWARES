import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SAFE_ID = /^[a-zA-Z0-9_-]{8,120}$/;
const STUDIO_STATUSES = new Set([
  'idle', 'bridge-unavailable', 'attention', 'opening-chat', 'recovering-result',
  'checking-chat', 'initializing-chat', 'refreshing-chat', 'initialization-verified', 'ready',
  'creative-plan-preparing', 'creative-plan-generating', 'creative-plan-ready',
  'asset-preparing', 'asset-generating', 'asset-captured', 'assets-ready',
  'code-preparing', 'code-generating', 'code-retrying', 'code-fragment-ready', 'output-ready',
  'run-detected', 'browser-unavailable', 'waiting-chat-visibility', 'access-state-recovered',
]);

export function readPublicActiveRun(activeRunPath) {
  if (!existsSync(activeRunPath)) return null;
  const parsed = readActiveRun(activeRunPath);
  const creative = parsed.generationManifest;
  if (!creative || typeof creative !== 'object' || typeof creative.id !== 'string' || typeof creative.digest !== 'string' || !creative.manifest || typeof creative.manifest !== 'object') {
    throw new Error('El expediente activo no contiene un manifiesto creativo válido.');
  }
  return {
    runId: String(parsed.runId),
    executionGeneration: Number.isSafeInteger(parsed.executionGeneration) ? parsed.executionGeneration : 0,
    status: typeof parsed.studioStatus === 'string' ? parsed.studioStatus : (typeof parsed.status === 'string' ? parsed.status : 'pending'),
    mode: parsed.mode === 'initialization_only' ? 'initialization_only' : 'production',
    executionMode: parsed.browserMode === 'headless' ? 'headless' : 'interactive',
    generationManifest: { id: creative.id, digest: creative.digest, schemaVersion: creative.schemaVersion, manifest: creative.manifest },
  };
}

export function updateStudioProgress(activeRunPath, input) {
  const runId = String(input?.runId || '');
  const executionGeneration = Number(input?.executionGeneration);
  const status = String(input?.status || '');
  const message = String(input?.message || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
  if (!SAFE_ID.test(runId) || !Number.isSafeInteger(executionGeneration) || executionGeneration < 0 || !STUDIO_STATUSES.has(status)) throw new Error('El progreso de Demo Studio no es válido.');
  const parsed = readActiveRun(activeRunPath);
  if (parsed.runId !== runId) throw new Error('El progreso pertenece a otro run.');
  if (Number(parsed.executionGeneration || 0) !== executionGeneration) throw new Error('El progreso pertenece a otra generación.');
  const next = { ...parsed, studioStatus: status, studioMessage: message, studioUpdatedAt: new Date().toISOString() };
  mkdirSync(path.dirname(activeRunPath), { recursive: true });
  const temporary = `${activeRunPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(temporary, activeRunPath);
  return { runId, executionGeneration, status, updatedAt: next.studioUpdatedAt };
}

function readActiveRun(activeRunPath) {
  const raw = readFileSync(activeRunPath, 'utf8');
  if (raw.length > 512_000) throw new Error('El expediente activo excede el tamaño permitido.');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !SAFE_ID.test(String(parsed.runId || ''))) throw new Error('El expediente activo no tiene un runId válido.');
  return parsed;
}
