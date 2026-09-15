import { runOnce } from './cli.mjs';
import path from 'node:path';
import { acquireDaemonLock, DaemonAlreadyRunningError } from './daemon-lock.mjs';

const pollMs = Math.max(5_000, Number(process.env.LMWARES_DEMO_RUNNER_POLL_MS ?? 15_000));
const projectsRoot = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const lockPath = process.env.LMWARES_DEMO_DAEMON_LOCK_PATH ?? path.join(projectsRoot, 'control', 'daemon.lock');

let lock;
let stopping = false;
try {
  lock = await acquireDaemonLock(lockPath);
} catch (error) {
  if (error instanceof DaemonAlreadyRunningError) {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    throw error;
  }
}

if (lock) {
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`LMWares demo runner se detiene por ${signal}.`);
    await lock.release().catch((error) => console.error(`No se pudo liberar el lock: ${error.message}`));
    process.exit(0);
  };
  process.once('SIGINT', () => { void stop('SIGINT'); });
  process.once('SIGTERM', () => { void stop('SIGTERM'); });
  process.once('exit', () => { void lock.release(); });

  console.log(`LMWares demo runner activo en modo singleton; consulta cada ${pollMs / 1000}s.`);
  while (!stopping) {
    try { await runOnce({ quietIdle: true }); }
    catch (error) { console.error(error instanceof Error ? error.message : error); }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
