import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const incoming = process.env.LMWARES_DEMO_INCOMING_ROOT ?? 'C:\\dev\\lmwares-demo-incoming';
const activePath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(root, 'control', 'active-run.json');
const requestedRunId = process.argv.includes('--run-id') ? process.argv[process.argv.indexOf('--run-id') + 1] : '';
const active = await jsonOrError(activePath);
const run = active.value;
const runId = requestedRunId || run?.runId || '';
const access = await jsonOrError(path.join(root, 'control', 'browser-access-state.json'));
const output = await outputSummary(runId);
const devtools = await devtoolsSummary();
console.log(JSON.stringify({
  observedAt: new Date().toISOString(),
  run: run ? { runId: run.runId, jobId: run.jobId, executionGeneration: run.executionGeneration, status: run.status, studioStatus: run.studioStatus ?? null, studioMessage: run.studioMessage ?? null, studioUpdatedAt: run.studioUpdatedAt ?? null, browserLaunch: run.browserLaunch ? { launchedAt: run.browserLaunch.launchedAt ?? null, error: run.browserLaunch.error ?? null } : null } : null,
  activeRunError: active.error, access: access.value ? { state: access.value.state, category: access.value.category, lastObservedAt: access.value.lastObservedAt, lastError: access.value.lastError } : null,
  accessError: access.error, devtools, output,
}, null, 2));

async function jsonOrError(file) { try { return { value: JSON.parse(await readFile(file, 'utf8')), error: null }; } catch (error) { return { value: null, error: error?.code === 'ENOENT' ? 'missing' : `invalid:${error.message}` }; } }
async function outputSummary(id) { if (!id) return { status: 'run-id-missing' }; const candidates = [path.join(incoming, id), path.join(incoming, 'LMWARES-DEMO-INCOMING', id)]; const found = []; for (const directory of candidates) { try { const files = await readdir(directory); found.push({ directory, files: files.filter((file) => ['creative-plan.json', 'code-package.json', 'assets'].includes(file)).sort() }); } catch {} } return { directories: found }; }
async function devtoolsSummary() { try { const response = await fetch(process.env.LMWARES_DEMO_BROWSER_DEBUG_URL ?? 'http://127.0.0.1:9223/json/list'); if (!response.ok) return { status: `http-${response.status}` }; const targets = await response.json(); return { status: 'ready', chatPages: targets.filter((target) => target.type === 'page' && /^https:\/\/chatgpt\.com\//.test(target.url || '')).length, worker: targets.some((target) => target.type === 'service_worker' && /\/demo-service-worker\.js$/.test(target.url || '')) }; } catch { return { status: 'unavailable' }; } }
