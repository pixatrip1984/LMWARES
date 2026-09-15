import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const extensionPath = args.get('--extension-path');
const extensionId = args.get('--extension-id');
const endpoint = args.get('--debug-url') ?? 'http://127.0.0.1:9223';
const executionMode = args.get('--execution-mode') ?? 'isolated-desktop';
if (!['headless', 'interactive', 'isolated-desktop'].includes(executionMode)) throw new Error('Invalid Demo Studio execution mode.');
if (!extensionPath || !/^[a-p]{32}$/.test(extensionId || '')) throw new Error('Faltan la ruta o el id válido de Demo Studio.');

const diskManifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
const activeRun = await activeRunSummary(process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? 'C:\\dev\\lmwares-demos\\control\\active-run.json');
const extensionTarget = await waitForExtensionTarget(12_000);
const previousVersion = await extensionVersion(extensionTarget);
const activeJob = await activeJobSummary(extensionTarget);
const activeJobMatchesRun = Boolean(activeJob && activeRun && activeJob.runId === activeRun.runId && activeJob.executionGeneration === activeRun.executionGeneration);
// Unpacked extensions can keep an old service-worker script even after their
// manifest version changes on disk. Reload before a prompt exists. The action
// popup is deliberately not a persistent tab: it can hide ChatGPT and leave
// its DOM unsuitable for lifecycle decisions.
if (!activeJobMatchesRun) await evaluate(extensionTarget.webSocketDebuggerUrl, 'chrome.runtime.reload(); "reload-requested"').catch(() => null);
if (!activeJobMatchesRun) await delay(900);
const loadedTarget = activeJobMatchesRun ? extensionTarget : await waitForExtensionTarget(12_000);
const loadedVersion = await extensionVersion(loadedTarget);

if (loadedVersion !== diskManifest.version) {
  throw new Error(`Brave conserva Demo Studio ${loadedVersion || 'desconocida'}; se esperaba ${diskManifest.version}.`);
}

await setExecutionMode(loadedTarget, executionMode);
await closePersistentSupervisorTabs();
console.log(JSON.stringify({ status: 'extension_ready', version: loadedVersion, previousVersion, executionMode, activeJob, activeJobMatchesRun, reloaded: !activeJobMatchesRun }));

async function listTargets() {
  const response = await fetch(`${endpoint}/json/list`);
  if (!response.ok) throw new Error(`DevTools respondió HTTP ${response.status}.`);
  return response.json();
}

async function waitForExtensionTarget(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets();
      const found = targets.find((target) => (
        target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/demo-service-worker.js`
      ));
      if (found?.webSocketDebuggerUrl) return found;
    } catch { /* Brave is still starting. */ }
    await delay(250);
  }
  throw new Error('Brave no cargó el contexto de Demo Studio.');
}

async function extensionVersion(target) {
  if (!target?.webSocketDebuggerUrl) return '';
  const value = await evaluate(target.webSocketDebuggerUrl, 'chrome.runtime.getManifest().version').catch(() => '');
  return typeof value === 'string' ? value : '';
}

async function activeJobSummary(target) {
  const expression = `(async () => { const value = await chrome.storage.local.get('lmwares.demo-studio.state.v1'); const state = value['lmwares.demo-studio.state.v1'] || {}; const active = state.activeJob; return active ? { attemptId: String(active.attemptId || ''), stage: String(active.stage || ''), runId: String(active.runId || ''), executionGeneration: Number(active.executionGeneration) } : null; })()`;
  return evaluate(target.webSocketDebuggerUrl, expression).catch(() => null);
}

async function activeRunSummary(activeRunPath) {
  try { const run = JSON.parse(await readFile(activeRunPath, 'utf8')); return { runId: String(run.runId || ''), executionGeneration: Number(run.executionGeneration) }; }
  catch { return null; }
}

async function setExecutionMode(target, mode) {
  const runtimeMode = mode === 'headless' ? 'headless' : 'interactive';
  const expression = `(async () => { const key = 'lmwares.demo-studio.runtime.v1'; await chrome.storage.local.set({ [key]: { executionMode: ${JSON.stringify(runtimeMode)}, configuredAt: new Date().toISOString() } }); return ${JSON.stringify(runtimeMode)}; })()`;
  const saved = await evaluate(target.webSocketDebuggerUrl, expression);
  if (saved !== runtimeMode) throw new Error('Could not persist Demo Studio execution mode.');
}

async function closePersistentSupervisorTabs() {
  const targets = await listTargets();
  const duplicates = targets.filter((target) => target.type === 'page' && (
    /chrome-extension:\/\/[^/]+\/demo-popup\.html(?:\?|$)/.test(target.url)
  ));
  await Promise.all(duplicates.map((target) => fetch(`${endpoint}/json/close/${encodeURIComponent(target.id)}`).catch(() => null)));
}

function evaluate(url, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('DevTools no respondió.'));
    }, 5_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text || 'Falló la evaluación DevTools.'));
      else resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('No se pudo conectar a DevTools.'));
    });
  });
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
