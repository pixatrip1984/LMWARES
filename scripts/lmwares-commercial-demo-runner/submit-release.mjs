#!/usr/bin/env node
import { readFile, readdir, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateActiveRun } from './runner-automation.mjs';

const apiUrl = (process.env.LMWARES_PUBLIC_API_URL ?? 'https://api.lmwares.com').replace(/\/$/, '');
const runnerToken = process.env.LMWARES_COMMERCIAL_DEMO_RUNNER_TOKEN ?? '';
const projectsRoot = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const activeRunPath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(projectsRoot, 'control', 'active-run.json');

export async function submitRelease() {
  if (!runnerToken) throw new Error('Falta LMWARES_COMMERCIAL_DEMO_RUNNER_TOKEN.');
  const run = JSON.parse(await readFile(activeRunPath, 'utf8'));
  if (run?.schemaVersion !== 'lmwares.demo-studio-active-run.v1' || !run.jobId || !run.runId || !run.leaseToken) throw new Error('No existe un run activo válido.');
  if (run.fixture) throw new Error('Un fixture de demo sólo puede ensamblarse y revisarse localmente; no se puede enviar a Oracle.');
  const runnerId = String(run.runnerId || process.env.LMWARES_COMMERCIAL_DEMO_RUNNER_ID || '');
  if (!runnerId) throw new Error('El run no conserva la identidad del runner que posee el lease.');
  const root = path.join(projectsRoot, '.staging', run.jobId, run.runId, 'release');
  const assembly = JSON.parse(await readFile(path.join(projectsRoot, '.staging', run.jobId, run.runId, 'assembly.json'), 'utf8'));
  const routeManifest = assembly.output.routeManifest;
  const finalizeBody = JSON.stringify({
    runnerId, leaseToken: run.leaseToken, projectPath: run.projectPath,
    generationManifestDigest: run.generationManifest.digest,
    buildDigest: sha256(await readFile(path.join(root, 'lmwares-demo-output.json'))),
    assetManifestDigest: sha256(await readFile(path.join(root, 'evidence', 'asset-manifest.json'))),
    evidenceDigest: sha256(await readFile(path.join(root, 'evidence', 'checksums.json'))),
    routeManifestDigest: digestJson(routeManifest), routeManifest,
  });
  let current = run;
  if (run.submissionStage !== 'finalizing') {
    current = await updateActiveRun(activeRunPath, run.runId, { status: 'uploading_release', submissionStage: 'uploading', lastError: null });
    const files = await listReleaseUploadFiles(root);
    for (const relative of files) {
      const body = await readFile(path.join(root, relative));
      await request(`/internal/commercial-demo-jobs/${encodeURIComponent(run.jobId)}/release-files/${relative.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'PUT', body,
        headers: { 'X-LMWares-Runner-Id': runnerId, 'X-LMWares-Lease-Token': run.leaseToken, 'X-LMWares-Content-SHA256': sha256(body) },
      });
    }
    current = await updateActiveRun(activeRunPath, run.runId, { status: 'finalizing_release', submissionStage: 'finalizing', uploadedAt: new Date().toISOString(), lastError: null });
  }
  const response = await request(`/internal/commercial-demo-jobs/${encodeURIComponent(run.jobId)}/submit-release`, {
    method: 'POST', body: finalizeBody, headers: { 'content-type': 'application/json' },
  });
  await writeJsonAtomic(activeRunPath, { ...current, status: 'submitted_for_review', submissionStage: 'complete', releaseId: response.release?.id ?? null, submittedAt: new Date().toISOString(), lastError: null });
  console.log(JSON.stringify({ status: 'submitted_for_review', runId: run.runId, releaseId: response.release?.id ?? null }, null, 2));
  return response;
}

async function request(pathname, input) {
  const response = await fetch(`${apiUrl}${pathname}`, { method: input.method, headers: { authorization: `Bearer ${runnerToken}`, ...(input.headers || {}) }, body: input.body });
  const text = await response.text(); const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
  return data;
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`; }
function digestJson(value) { return sha256(Buffer.from(stableJson(value), 'utf8')); }
async function listFiles(root, relative = '') { const entries = await readdir(path.join(root, relative), { withFileTypes: true }); const out = []; for (const entry of entries) { const next = path.join(relative, entry.name); if (entry.isDirectory()) out.push(...await listFiles(root, next)); else if (entry.isFile()) out.push(next.replace(/\\/g, '/')); } return out.sort(); }
export function isRemoteReleaseArtifact(relativePath) {
  const relative = String(relativePath || '').replace(/\\/g, '/');
  if (relative === 'lmwares-demo-output.json') return true;
  if (relative.startsWith('evidence/')) return true;
  // Source and platform-specific control files remain in the local project and
  // delivery ZIP. Oracle's R2 candidate contains only assets its review/public
  // serving pipeline can address directly.
  if (relative === 'dist/_headers' || relative === 'dist/_redirects') return false;
  return relative.startsWith('dist/');
}
export async function listReleaseUploadFiles(root) {
  return (await listFiles(root)).filter(isRemoteReleaseArtifact);
}
async function writeJsonAtomic(target, value) { await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, target); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) submitRelease().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
