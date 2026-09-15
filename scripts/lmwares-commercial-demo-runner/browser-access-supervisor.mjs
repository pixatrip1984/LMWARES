import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { probeBrowserAccess } from './browser-access-probe.mjs';
import { readBrowserAccessState, stateForRun, writeBrowserAccessState } from './browser-access-state.mjs';
import { transitionBrowserSession } from './browser-session-manager.mjs';

const AUTO_CHECK_MS = Math.max(5_000, Number(process.env.LMWARES_DEMO_ACCESS_AUTO_CHECK_MS ?? 45_000));
const STABLE_MS = Math.max(2_000, Number(process.env.LMWARES_DEMO_ACCESS_STABLE_MS ?? 10_000));

export function decideBrowserAccess(current, observation, now = new Date()) {
  const at = now.toISOString();
  const next = { ...current, category: observation.category, lastObservedAt: at, lastError: observation.category === 'ready' ? null : observation.message, updatedAt: at };
  if (observation.category === 'ready') {
    const stableSince = current.stableSince || at;
    next.stableSince = stableSince;
    const stableFor = now.getTime() - Date.parse(stableSince);
    if (current.state === 'interactive-wait' && stableFor >= STABLE_MS) return { state: { ...next, state: 'access-restored', transition: 'return-background' }, action: 'return-background' };
    return { state: { ...next, state: current.state === 'background-verifying' ? 'background-running' : current.state, transition: null }, action: 'none' };
  }
  next.stableSince = null;
  if (observation.category === 'challenge' || observation.category === 'login-required') {
    const startedAt = current.automaticCheckStartedAt || at;
    next.automaticCheckStartedAt = startedAt;
    if (current.state === 'interactive-wait') return { state: { ...next, state: 'interactive-wait', transition: null }, action: 'none' };
    if (now.getTime() - Date.parse(startedAt) < AUTO_CHECK_MS) return { state: { ...next, state: 'access-checking', transition: 'wait' }, action: 'wait' };
    if (current.openedInteractiveCount >= 1) return { state: { ...next, state: 'recovery-paused', transition: 'human-required-already-opened' }, action: 'pause' };
    return { state: { ...next, state: 'human-required', transition: 'open-interactive', openedInteractiveCount: current.openedInteractiveCount + 1 }, action: 'open-interactive' };
  }
  return { state: { ...next, state: observation.category === 'network-unavailable' ? 'recovery-paused' : 'background-verifying', transition: 'wait' }, action: 'wait' };
}

export function completeBrowserTransition(state, action, result, now = new Date()) {
  if (!result?.transitioned) return { ...state, state: 'recovery-paused', transition: `transition-${result?.reason || 'failed'}`, updatedAt: now.toISOString() };
  if (action === 'open-interactive') return { ...state, state: 'interactive-wait', transition: null, updatedAt: now.toISOString() };
  if (action === 'return-background') return { ...state, state: 'background-verifying', transition: null, updatedAt: now.toISOString() };
  return state;
}

export async function superviseBrowserAccess({ activeRunPath, statePath, endpoint, extensionId, launcherPath, debuggingPort, automate = false, now = new Date(), transition = transitionBrowserSession }) {
  const run = JSON.parse(await readFile(activeRunPath, 'utf8'));
  const existing = await readBrowserAccessState(statePath);
  const current = stateForRun(existing, run, now);
  const observation = await probeBrowserAccess({ endpoint, extensionId });
  const decided = decideBrowserAccess(current, observation, now);
  let state = decided.state;
  let transitionResult = null;
  if (automate && ['open-interactive', 'return-background'].includes(decided.action)) {
    transitionResult = await transition({ action: decided.action, launcherPath, endpoint, debuggingPort });
    state = completeBrowserTransition(state, decided.action, transitionResult, now);
  }
  await writeBrowserAccessState(statePath, state);
  return { runId: run.runId, executionGeneration: current.executionGeneration, observation, action: decided.action, transition: transitionResult, state };
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const root = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
  const result = await superviseBrowserAccess({
    activeRunPath: process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(root, 'control', 'active-run.json'),
    statePath: process.env.LMWARES_DEMO_ACCESS_STATE_PATH ?? path.join(root, 'control', 'browser-access-state.json'),
    endpoint: process.env.LMWARES_DEMO_BROWSER_DEBUG_URL ?? 'http://127.0.0.1:9223',
    extensionId: process.env.LMWARES_DEMO_EXTENSION_ID ?? 'onnphmgblmlnecgmnknbhgflibbpckln',
    launcherPath: process.env.LMWARES_DEMO_BROWSER_LAUNCHER ?? path.join(path.dirname(modulePath), 'start-brave-demo-studio.ps1'),
    debuggingPort: Number(process.env.LMWARES_DEMO_BROWSER_DEBUG_PORT ?? 9223),
    automate: /^(?:1|true|on)$/i.test(process.env.LMWARES_DEMO_ACCESS_AUTOMATION ?? 'false'),
  });
  console.log(JSON.stringify(result, null, 2));
}
