#!/usr/bin/env node
import { mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleRelease } from './assemble-release.mjs';
import { submitRelease } from './submit-release.mjs';
import {
  archiveAbandonedRun,
  archiveCompletedRun,
  defaultRunnerId,
  findCompleteIncomingOutput,
  runnerIdForRun,
  shouldLaunchBrowser,
  updateActiveRun,
} from './runner-automation.mjs';

const apiUrl = (process.env.LMWARES_PUBLIC_API_URL ?? 'https://api.lmwares.com').replace(/\/$/, '');
const runnerToken = process.env.LMWARES_COMMERCIAL_DEMO_RUNNER_TOKEN ?? '';
const runnerId = process.env.LMWARES_COMMERCIAL_DEMO_RUNNER_ID ?? defaultRunnerId();
const projectsRoot = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const incomingRoot = process.env.LMWARES_DEMO_INCOMING_ROOT ?? 'C:\\dev\\lmwares-demo-incoming';
const starterRepo = process.env.LMWARES_DEMO_STARTER_REPO ?? 'https://github.com/pixatrip1984/cloudflare-starter.git';
const starterBranch = process.env.LMWARES_DEMO_STARTER_BRANCH ?? 'cloudflare-starter-v01';
const activeRunPath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(projectsRoot, 'control', 'active-run.json');
const browserLauncher = process.env.LMWARES_DEMO_BROWSER_LAUNCHER ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'start-brave-demo-studio.ps1');
const browserCloser = process.env.LMWARES_DEMO_BROWSER_CLOSER ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'stop-brave-demo-studio.ps1');
const browserAutoLaunch = !/^(?:0|false|off)$/i.test(process.env.LMWARES_DEMO_BROWSER_AUTO_LAUNCH ?? 'true');
const browserRetryMs = Math.max(15_000, Number(process.env.LMWARES_DEMO_BROWSER_RETRY_MS ?? 60_000));

export async function runOnce(options = {}) {
  if (!runnerToken) throw new Error('Falta LMWARES_COMMERCIAL_DEMO_RUNNER_TOKEN.');
  const active = await readActiveRun();
  // The browser integration fixture is deliberately lease-less and locally
  // fenced.  It exercises the same extension/native-host contract without
  // touching the claim or renewal API, and submit-release.mjs rejects it.
  if (isLocalBrowserFixture(active)) {
    if (!options.quietIdle) console.log(JSON.stringify({ status: 'fixture_pending', runId: active.runId }));
    return active;
  }
  if (active && isActiveRun(active)) {
    if (active.status === 'submitted_for_review') return finishSubmittedRun(active);
    if (active.status !== 'lease_lost') return renewActiveRun(active);
    await finishAbandonedRun(active);
  }
  if (active && !isActiveRun(active)) await archiveInvalidActiveRun('El archivo de run activo era inválido y se archivó.');
  const claimed = await post('/internal/commercial-demo-jobs/claim', { runnerId });
  if (!claimed.job) {
    if (!options.quietIdle) console.log(JSON.stringify({ status: 'idle' }));
    return null;
  }
  const { job, intake, lifecycle, acceptedOffer, buildSpec, generationManifest, creativeRun } = claimed;
  assertClaim(claimed);
  const projectPath = path.join(projectsRoot, lifecycle.slug);
  try {
    await ensureProject(projectPath);
    const run = {
      schemaVersion: 'lmwares.demo-studio-active-run.v1', runId: creativeRun.id, status: 'awaiting_chat', runnerId,
      jobId: job.id, leaseToken: job.leaseToken, executionGeneration: job.executionGeneration,
      lifecycleId: lifecycle.id, intakeId: intake.id, offerId: acceptedOffer.id, projectPath, createdAt: new Date().toISOString(),
      buildSpec: { id: buildSpec.id, digest: buildSpec.specDigest, schemaVersion: buildSpec.schemaVersion },
      generationManifest: { id: generationManifest.id, digest: generationManifest.manifestDigest, schemaVersion: generationManifest.schemaVersion, manifest: generationManifest.manifest },
    };
    await writeJson(path.join(projectPath, '.lmwares', 'phase-0-demo-studio.json'), run);
    await writeJson(activeRunPath, run);
    await ensureBrowserLaunched(run);
    console.log(JSON.stringify({ status: 'awaiting_chat_initialization', runId: run.runId, jobId: job.id, projectPath }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    await post(`/internal/commercial-demo-jobs/${encodeURIComponent(job.id)}/fail`, { runnerId, leaseToken: job.leaseToken, code: 'demo_studio_prepare_failed', message }).catch(() => {});
    throw error;
  }
}

async function finishAbandonedRun(run) {
  const target = await archiveAbandonedRun(activeRunPath, run);
  await closeDedicatedBrowser(run);
  console.warn(JSON.stringify({ status: 'lease_lost_archived', runId: run.runId, jobId: run.jobId, executionGeneration: run.executionGeneration, archivedRunPath: target }));
}

async function renewActiveRun(active) {
  if (!isActiveRun(active)) return clearInvalidActiveRun('El archivo de run activo es inválido.');
  const leaseRunnerId = runnerIdForRun(active, runnerId);
  try {
    await post(`/internal/commercial-demo-jobs/${encodeURIComponent(active.jobId)}/heartbeat`, { runnerId: leaseRunnerId, leaseToken: active.leaseToken });
    let current = await ensureBrowserLaunched(active);
    current = await advanceDownloadedOutput(current);
    console.log(JSON.stringify({ status: current.status, studioStatus: current.studioStatus ?? null, runId: current.runId, jobId: current.jobId, projectPath: current.projectPath }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo renovar el lease.';
    if (/lease|trabajo ya no pertenece|HTTP 409|HTTP 403/i.test(message)) {
      await writeJson(activeRunPath, { ...active, status: 'lease_lost', lastError: message, updatedAt: new Date().toISOString() });
    }
    throw new Error(`El lease de la demo activa se perdió: ${message}`);
  }
}

async function ensureBrowserLaunched(run) {
  if (!browserAutoLaunch || !shouldLaunchBrowser(run, Date.now(), browserRetryMs)) return run;
  let current = await updateActiveRun(activeRunPath, run.runId, {
    browserLaunch: { attemptedAt: new Date().toISOString(), launcher: browserLauncher },
  });
  try {
    await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', browserLauncher]);
    current = await updateActiveRun(activeRunPath, run.runId, {
      browserLaunch: { ...current.browserLaunch, launchedAt: new Date().toISOString(), error: null },
    });
    console.log(JSON.stringify({ status: 'browser_launched', runId: run.runId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current = await updateActiveRun(activeRunPath, run.runId, {
      browserLaunch: { ...current.browserLaunch, error: message },
      lastError: `No se pudo abrir Demo Studio: ${message}`,
    });
    console.error(`No se pudo abrir Brave para ${run.runId}: ${message}`);
  }
  return current;
}

async function advanceDownloadedOutput(run) {
  if (['assembled', 'uploading_release', 'finalizing_release', 'submit_failed'].includes(run.status) || await hasAssemblyReceipt(run)) return submitAndArchive(run);
  let ready;
  try { ready = await findCompleteIncomingOutput(run, incomingRoot); }
  catch (error) { return recordLocalPipelineError(run, error); }
  if (!ready) return run;
  try {
    await updateActiveRun(activeRunPath, run.runId, { status: 'assembling', lastError: null });
    await assembleRelease();
    const assembled = await updateActiveRun(activeRunPath, run.runId, { status: 'assembled', assembledAt: new Date().toISOString(), lastError: null });
    return submitAndArchive(assembled);
  } catch (error) {
    return recordLocalPipelineError(run, error);
  }
}

async function submitAndArchive(run) {
  try {
    await submitRelease();
    const submitted = JSON.parse(await readFile(activeRunPath, 'utf8'));
    await finishSubmittedRun(submitted);
    return submitted;
  } catch (error) {
    return recordLocalPipelineError(run, error, 'submit_failed');
  }
}

async function finishSubmittedRun(run) {
  const target = await archiveCompletedRun(activeRunPath, run);
  await closeDedicatedBrowser(run);
  console.log(JSON.stringify({ status: 'submitted_for_review', runId: run.runId, releaseId: run.releaseId ?? null, archivedRunPath: target }));
  return run;
}

async function closeDedicatedBrowser(run) {
  try {
    await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', browserCloser]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`La demo ${run.runId} ya fue entregada, pero no se pudo cerrar su Brave dedicado: ${message}`);
  }
}

async function recordLocalPipelineError(run, error, code = 'local_pipeline_failed') {
  const message = error instanceof Error ? error.message : String(error);
  if (run.lastError !== message || run.status !== code) console.error(`Pipeline local ${run.runId}: ${message}`);
  return updateActiveRun(activeRunPath, run.runId, { status: code, lastError: message, lastPipelineAttemptAt: new Date().toISOString() });
}

async function hasAssemblyReceipt(run) {
  try {
    await access(path.join(projectsRoot, '.staging', run.jobId, run.runId, 'assembly.json'));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readActiveRun() {
  try {
    return JSON.parse(await readFile(activeRunPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      await archiveInvalidActiveRun('El JSON del run activo era inválido y se archivó.');
      return null;
    }
    throw error;
  }
}
async function archiveInvalidActiveRun(message) {
  const archiveDirectory = path.join(path.dirname(activeRunPath), 'invalid-runs');
  const target = path.join(archiveDirectory, `active-run-${Date.now()}-${process.pid}.json`);
  await mkdir(archiveDirectory, { recursive: true });
  try { await rename(activeRunPath, target); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  console.warn(`${message} Evidencia: ${target}`);
}
function isActiveRun(run) { return run?.schemaVersion === 'lmwares.demo-studio-active-run.v1' && /^[a-zA-Z0-9_-]{8,120}$/.test(String(run.runId || '')) && /^[a-zA-Z0-9_-]{8,120}$/.test(String(run.jobId || '')) && typeof run.leaseToken === 'string' && run.leaseToken.length >= 16 && typeof run.projectPath === 'string' && run.projectPath.length > 3; }
function isLocalBrowserFixture(run) {
  return run?.schemaVersion === 'lmwares.demo-studio-active-run.v1'
    && /^test_full_demo_[0-9]+$/.test(String(run.runId || ''))
    && run?.fixture?.kind === 'full-demo-browser-integration'
    && run.fixture.submitAllowed === false
    && typeof run.projectPath === 'string'
    && run.projectPath.length > 3
    && run.generationManifest?.manifest;
}

function assertClaim(claimed) {
  const { job, intake, lifecycle, acceptedOffer, buildSpec, generationManifest, creativeRun } = claimed;
  if (!job?.leaseToken || !lifecycle?.id || !intake?.id || !acceptedOffer?.id) throw new Error('El API no entregó un trabajo de demo válido.');
  if (!buildSpec || buildSpec.schemaVersion !== 'lmwares.demo-build-spec.v1' || buildSpec.acceptedOfferId !== acceptedOffer.id || buildSpec.spec?.lifecycleId !== lifecycle.id || buildSpec.spec?.intakeId !== intake.id) throw new Error('El expediente de demo no coincide con el trabajo reclamado.');
  if (!generationManifest || generationManifest.buildSpecId !== buildSpec.id || generationManifest.manifest?.buildSpecDigest !== buildSpec.specDigest) throw new Error('El manifiesto creativo no coincide con el expediente inmutable.');
  if (!creativeRun || creativeRun.lifecycleId !== lifecycle.id || creativeRun.jobId !== job.id || creativeRun.executionGeneration !== job.executionGeneration) throw new Error('El run creativo no coincide con el lease reclamado.');
}

async function writeJson(target, value) { await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temporary, target); }
async function ensureProject(projectPath) { try { await access(path.join(projectPath, '.git')); return; } catch {} await mkdir(projectsRoot, { recursive: true }); await run('git', ['clone', '--branch', starterBranch, '--single-branch', starterRepo, projectPath]); }
async function post(pathname, body) { const response = await fetch(`${apiUrl}${pathname}`, { method: 'POST', headers: { authorization: `Bearer ${runnerToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); const text = await response.text(); const data = text ? JSON.parse(text) : null; if (!response.ok) throw new Error(data?.error?.message ?? `HTTP ${response.status}`); return data; }
function runCommand(command, args) { return new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: 'inherit', shell: false, windowsHide: true }); child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} terminó con código ${code}.`))); }); }
function run(command, args) { return runCommand(command, args); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runOnce().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
