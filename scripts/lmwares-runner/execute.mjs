import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { RUNNER_VERSION } from './catalog.mjs';
import { RunnerError } from './policy.mjs';

const SAFE_ENV_KEYS = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'LANG',
];

export async function executeValidator({
  projectId,
  repoPath,
  validator,
  runsRoot,
  npmCliPath,
  outputLimitBytes = 16_384,
}) {
  const resolvedNpmCli = await resolveNpmCli(npmCliPath);
  const runId = randomUUID();
  const startedAt = new Date();
  const startedTick = performance.now();
  const stdout = createOutputCollector(outputLimitBytes);
  const stderr = createOutputCollector(outputLimitBytes);
  const git = readGitState(repoPath);
  let timedOut = false;
  let spawnError = null;

  const child = spawn(process.execPath, [resolvedNpmCli, 'run', validator.script], {
    cwd: repoPath,
    env: buildSafeEnvironment(),
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => stdout.push(chunk));
  child.stderr?.on('data', (chunk) => stderr.push(chunk));

  const outcome = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
    }, validator.timeoutMs);

    child.once('error', (error) => {
      spawnError = error;
      finish({ exitCode: null, signal: null });
    });
    child.once('close', (exitCode, signal) => finish({ exitCode, signal }));
  });

  const completedAt = new Date();
  const durationMs = Math.max(0, Math.round(performance.now() - startedTick));
  const stdoutResult = stdout.finish();
  const stderrResult = stderr.finish();
  const status = timedOut || spawnError ? 'blocked' : outcome.exitCode === 0 ? 'passed' : 'failed';
  const runDirectory = path.join(runsRoot, safeSegment(projectId), runId);
  const artifactPath = path.join(runDirectory, 'evidence.json');
  const result = {
    schemaVersion: 1,
    runnerVersion: RUNNER_VERSION,
    runId,
    projectId,
    validatorId: validator.id,
    kind: validator.kind,
    label: validator.label,
    status,
    command: `npm run ${validator.script}`,
    environmentPolicy: 'minimal',
    sourceRevision: git.revision,
    gitDirty: git.dirty,
    exitCode: typeof outcome.exitCode === 'number' ? outcome.exitCode : null,
    signal: outcome.signal ?? null,
    timedOut,
    durationMs,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    stdoutTail: stdoutResult.tail,
    stderrTail: stderrResult.tail,
    stdoutSha256: stdoutResult.sha256,
    stderrSha256: stderrResult.sha256,
    outputTruncated: stdoutResult.truncated || stderrResult.truncated,
    spawnError: spawnError ? 'No fue posible iniciar el proceso permitido.' : null,
    summary: summaryFor(status, outcome.exitCode, durationMs, timedOut),
    artifactPath,
  };

  await writeEvidence(runDirectory, artifactPath, result);
  return result;
}

export async function resolveNpmCli(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Prueba el siguiente path conocido; nunca ejecuta búsqueda por shell.
    }
  }
  throw new RunnerError(500, 'npm_cli_not_found', 'No fue posible resolver npm-cli.js.');
}

function buildSafeEnvironment() {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_userconfig: process.platform === 'win32' ? 'NUL' : '/dev/null',
    npm_config_update_notifier: 'false',
  };
}

function createOutputCollector(limitBytes) {
  const hash = createHash('sha256');
  let tail = Buffer.alloc(0);
  let totalBytes = 0;

  return {
    push(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      totalBytes += buffer.length;
      tail = Buffer.concat([tail, buffer]);
      if (tail.length > limitBytes) tail = tail.subarray(tail.length - limitBytes);
    },
    finish() {
      return {
        tail: redactOutput(tail.toString('utf8')),
        sha256: hash.digest('hex'),
        truncated: totalBytes > limitBytes,
      };
    },
  };
}

export function redactOutput(value) {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s"'`]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT_REDACTED]');
}

function readGitState(repoPath) {
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
      env: buildSafeEnvironment(),
    }).trim();
    const dirty =
      execFileSync('git', ['status', '--porcelain'], {
        cwd: repoPath,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5_000,
        env: buildSafeEnvironment(),
      }).trim().length > 0;
    return { revision: revision || null, dirty };
  } catch {
    return { revision: null, dirty: null };
  }
}

function terminateProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
      return;
    }
    process.kill(-pid, 'SIGTERM');
  } catch {
    // El evento close resolverá el estado si el proceso ya terminó.
  }
}

async function writeEvidence(runDirectory, artifactPath, result) {
  await mkdir(runDirectory, { recursive: true });
  const temporaryPath = `${artifactPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, artifactPath);
}

function summaryFor(status, exitCode, durationMs, timedOut) {
  if (timedOut) return `Validador bloqueado por timeout después de ${durationMs} ms.`;
  if (status === 'passed') return `Validador completado correctamente en ${durationMs} ms.`;
  if (status === 'failed') return `Validador terminó con código ${exitCode} en ${durationMs} ms.`;
  return `No fue posible iniciar el validador permitido (${durationMs} ms).`;
}

function safeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
