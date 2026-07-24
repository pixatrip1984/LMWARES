import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { redactOutput } from '../lmwares-runner/execute.mjs';
import { AgentRunnerError } from './policy.mjs';

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
  'PROGRAMDATA',
  'LANG',
  'TERM',
  'CODEX_HOME',
];

export async function startCodexAgent({
  run,
  prompt,
  operation,
  model,
  schemaPath,
  imagePaths = [],
  runDirectory,
  codexCommand,
  timeoutMs,
  outputLimitBytes = 128 * 1024,
  skipGitRepoCheck = false,
  onEvent,
}) {
  await mkdir(runDirectory, { recursive: true });
  const resolvedCommand = codexCommand ?? (await resolveCodexCommand());
  const finalMessagePath = path.join(runDirectory, 'final-message.json');
  const args = [
    ...(resolvedCommand.prefixArgs ?? []),
    'exec',
    '-C',
    run.worktreePath,
    '--sandbox',
    operation === 'discover' ? 'read-only' : 'workspace-write',
    '--ignore-user-config',
    '--ephemeral',
    '-c',
    'approval_policy="never"',
    '-c',
    'model_reasoning_effort="xhigh"',
    '-c',
    'features.memories=false',
    '--json',
    '--color',
    'never',
    '--output-last-message',
    finalMessagePath,
  ];

  if (skipGitRepoCheck) {
    args.splice((resolvedCommand.prefixArgs?.length ?? 0) + 3, 0, '--skip-git-repo-check');
  }

  if (process.platform === 'win32') {
    args.push('-c', 'windows.sandbox="unelevated"');
  }

  if (model) args.push('--model', model);
  if (schemaPath) args.push('--output-schema', schemaPath);
  for (const imagePath of imagePaths) args.push('--image', imagePath);
  args.push('-');

  const stdout = createLineCollector(outputLimitBytes, (line) => {
    const event = parseEvent(line);
    if (event) onEvent?.(event);
  });
  const stderr = createByteCollector(outputLimitBytes);
  const startedTick = performance.now();
  let timedOut = false;
  let cancelled = false;
  let spawnError = null;

  const child = spawn(resolvedCommand.file, args, {
    cwd: run.worktreePath,
    env: buildSafeEnvironment(),
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => stdout.push(chunk));
  child.stderr?.on('data', (chunk) => stderr.push(chunk));
  child.stdin?.end(prompt, 'utf8');

  const completion = new Promise((resolve) => {
    let settled = false;
    const finish = async (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Math.max(0, Math.round(performance.now() - startedTick));
      const stdoutResult = stdout.finish();
      const stderrResult = stderr.finish();
      const finalMessage = await readFinalMessage(finalMessagePath, stdoutResult.events);
      const sandboxHealthy = !/orchestrator_helper_launch_failed|windows sandbox:.*failed/i.test(
        stderrResult.tail,
      );
      const status = cancelled
        ? 'cancelled'
        : timedOut || spawnError
          ? 'blocked'
          : operation === 'implement' && !sandboxHealthy
            ? 'blocked'
          : outcome.exitCode === 0
            ? 'succeeded'
            : 'failed';
      resolve({
        status,
        exitCode: typeof outcome.exitCode === 'number' ? outcome.exitCode : null,
        signal: outcome.signal ?? null,
        timedOut,
        cancelled,
        spawnError: spawnError ? 'No fue posible iniciar Codex CLI.' : null,
        durationMs,
        stdoutTail: stdoutResult.tail,
        stderrTail: stderrResult.tail,
        stdoutSha256: stdoutResult.sha256,
        stderrSha256: stderrResult.sha256,
        outputTruncated: stdoutResult.truncated || stderrResult.truncated,
        sandboxHealthy,
        warnings: sandboxHealthy
          ? []
          : ['El sandbox nativo de Windows no pudo inicializarse correctamente.'],
        threadId: stdoutResult.threadId,
        usage: stdoutResult.usage,
        finalMessage: finalMessage.text,
        result: finalMessage.result,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
    }, timeoutMs);

    child.once('error', (error) => {
      spawnError = error;
      void finish({ exitCode: null, signal: null });
    });
    child.once('close', (exitCode, signal) => {
      void finish({ exitCode, signal });
    });
  });

  return {
    child,
    completion,
    cancel() {
      cancelled = true;
      terminateProcessTree(child.pid);
    },
  };
}

export async function resolveCodexCommand() {
  const executableCandidates = [
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')
      : null,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex')
      : null,
  ].filter(Boolean);

  for (const candidate of executableCandidates) {
    try {
      await access(candidate);
      return { file: candidate, prefixArgs: [] };
    } catch {
      // Continúa con el siguiente binario conocido.
    }
  }

  const npmCli = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    : null;
  if (npmCli) {
    try {
      await access(npmCli);
      return { file: process.execPath, prefixArgs: [npmCli] };
    } catch {
      // Cae en el error explícito.
    }
  }

  throw new AgentRunnerError(503, 'codex_cli_not_found', 'Codex CLI no está instalado.');
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
  };
}

function createLineCollector(limitBytes, onLine) {
  const bytes = createByteCollector(limitBytes);
  let pending = '';
  let threadId = null;
  let usage = null;
  const events = [];

  return {
    push(chunk) {
      bytes.push(chunk);
      pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) consume(line);
    },
    finish() {
      if (pending.trim()) consume(pending);
      return { ...bytes.finish(), threadId, usage, events };
    },
  };

  function consume(line) {
    const event = parseEvent(line);
    if (!event) return;
    if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
      threadId = event.thread_id;
    }
    if (event.type === 'turn.completed' && event.usage && typeof event.usage === 'object') {
      usage = event.usage;
    }
    events.push(event);
    if (events.length > 80) events.shift();
    onLine(line);
  }
}

function createByteCollector(limitBytes) {
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

function parseEvent(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function readFinalMessage(filePath, events) {
  let text = '';
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    const messages = events
      .filter((event) => event?.type === 'item.completed' && event?.item?.type === 'agent_message')
      .map((event) => String(event.item.text ?? ''))
      .filter(Boolean);
    text = messages.at(-1) ?? '';
  }

  const trimmed = text.trim();
  if (!trimmed) return { text: '', result: null };
  try {
    return { text: trimmed, result: JSON.parse(trimmed) };
  } catch {
    return { text: redactOutput(trimmed), result: null };
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
    // El proceso pudo terminar antes de la cancelación.
  }
}
