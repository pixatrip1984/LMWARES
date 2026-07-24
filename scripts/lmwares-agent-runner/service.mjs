import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startCodexAgent, resolveCodexCommand } from './execute.mjs';
import { prepareAgentWorktree, readAgentGitState } from './git.mjs';
import { inspectAgentProject, AgentRunnerError } from './policy.mjs';
import { buildAgentPrompt } from './prompt.mjs';

export const AGENT_RUNNER_VERSION = 'lmwares.agent-runner/v1';
const TASK_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const BATCH_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const atomicWriteQueues = new Map();
const TASK_KEYS = new Set([
  'id',
  'title',
  'route',
  'objective',
  'criteria',
  'sourceFiles',
  'imagePaths',
  'visualFrames',
]);

export function createAgentRunnerService({
  scanPath,
  policyPath,
  runsRoot,
  designsRoot,
  schemaPath,
  codexCommand,
  discoveryTimeoutMs = 45 * 60_000,
  implementationTimeoutMs = 90 * 60_000,
  outputLimitBytes,
}) {
  const activeBatches = new Map();
  const activeRuns = new Map();

  return {
    async doctor(projectId) {
      const project = await inspectAgentProject({ projectId, scanPath, policyPath });
      let codex = { available: false, command: null };
      try {
        const resolved = codexCommand ?? (await resolveCodexCommand());
        codex = { available: true, command: path.basename(resolved.file) };
      } catch {
        codex = { available: false, command: null };
      }
      return publicProjectStatus(project, codex);
    },

    async status(projectId, batchId = null) {
      const project = await inspectAgentProject({ projectId, scanPath, policyPath });
      const batch = batchId
        ? await findBatch({ projectId, batchId, runsRoot, activeBatches })
        : await findLatestBatch({ projectId, runsRoot, activeBatches });
      return {
        schemaVersion: 1,
        runnerVersion: AGENT_RUNNER_VERSION,
        project: publicProjectStatus(project),
        batch: batch ? publicBatch(recoverInterruptedRuns(batch, activeRuns)) : null,
      };
    },

    async launch(projectId, input) {
      const request = validateLaunchRequest(input);
      const project = await inspectAgentProject({ projectId, scanPath, policyPath });
      assertProjectEnabled(project, request.mode);

      if (activeBatches.has(projectId)) {
        throw new AgentRunnerError(
          409,
          'project_busy',
          'Ya existe un lote de agentes activo para este proyecto.',
        );
      }
      if (request.tasks.length > project.maxParallel) {
        throw new AgentRunnerError(
          422,
          'parallel_limit_exceeded',
          `La política permite como máximo ${project.maxParallel} agentes simultáneos.`,
        );
      }

      const tasks = await validateTaskImages(request.tasks, designsRoot);
      const batchId = createBatchId();
      const batchDirectory = path.join(runsRoot, safeSegment(projectId), batchId);
      const batch = {
        schemaVersion: 1,
        runnerVersion: AGENT_RUNNER_VERSION,
        batchId,
        projectId,
        projectName: project.name,
        mode: request.mode,
        status: 'preparing',
        baseRef: project.baseRef,
        baseRevision: project.baseRevision,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        runnerPid: process.pid,
        runs: tasks.map((task) => ({
          runId: randomUUID(),
          taskId: task.id,
          title: task.title,
          route: task.route,
          objective: task.objective,
          criteria: task.criteria,
          sourceFiles: task.sourceFiles,
          imagePaths: task.imagePaths,
          visualFrames: task.visualFrames,
          status: 'queued',
          currentActivity: 'Esperando worktree',
          branchName: null,
          worktreePath: null,
          baseRevision: project.baseRevision,
          revision: null,
          dirty: null,
          changesPresent: null,
          changedFiles: [],
          promptSha256: null,
          threadId: null,
          usage: null,
          exitCode: null,
          signal: null,
          timedOut: false,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          summary: 'Ejecución en cola.',
          finalMessage: null,
          result: null,
          stderrTail: '',
          outputTruncated: false,
          artifactPath: path.join(batchDirectory, safeSegment(task.id), 'run.json'),
        })),
      };

      activeBatches.set(projectId, batch);
      await persistBatch(batchDirectory, batch);

      try {
        for (const run of batch.runs) {
          run.status = 'preparing';
          run.currentActivity = 'Creando worktree';
          const prepared = await prepareAgentWorktree({
            repoPath: project.repoPath,
            worktreesRoot: project.worktreesRoot,
            projectId,
            batchId,
            taskId: run.taskId,
            baseRef: project.baseRef,
            operation: request.mode,
          });
          run.worktreePath = prepared.worktreePath;
          run.branchName = prepared.branchName;
          run.baseRevision = prepared.baseRevision;
          run.status = 'queued';
          run.currentActivity = 'Worktree preparado';
        }
      } catch (error) {
        batch.status = 'blocked';
        batch.completedAt = new Date().toISOString();
        const pending = batch.runs.find((run) => run.status === 'preparing');
        if (pending) {
          pending.status = 'blocked';
          pending.summary = error instanceof Error ? error.message : 'No fue posible preparar el lote.';
          pending.completedAt = new Date().toISOString();
        }
        await persistBatch(batchDirectory, batch);
        activeBatches.delete(projectId);
        throw error;
      }

      batch.status = 'running';
      batch.startedAt = new Date().toISOString();
      await persistBatch(batchDirectory, batch);

      const completions = batch.runs.map(async (run) => {
        try {
          const task = tasks.find((candidate) => candidate.id === run.taskId);
          const prompt = buildAgentPrompt({
            project,
            task,
            operation: request.mode,
            baseRevision: run.baseRevision,
          });
          run.promptSha256 = createHash('sha256').update(prompt).digest('hex');
          run.status = 'running';
          run.currentActivity = 'Iniciando Codex';
          run.startedAt = new Date().toISOString();
          const runDirectory = path.dirname(run.artifactPath);
          await persistRun(run);

          const handle = await startCodexAgent({
            run,
            prompt,
            operation: request.mode,
            model: project.model,
            schemaPath: request.mode === 'discover' ? schemaPath : null,
            imagePaths: task.imagePaths,
            runDirectory,
            codexCommand,
            timeoutMs:
              request.mode === 'discover' ? discoveryTimeoutMs : implementationTimeoutMs,
            outputLimitBytes,
            onEvent(event) {
              applyEvent(run, event);
            },
          });
          activeRuns.set(run.runId, handle);
          run.currentActivity = 'Codex trabajando';
          await persistBatch(batchDirectory, batch);

          const result = await handle.completion;
          activeRuns.delete(run.runId);
          const git = await readAgentGitState(run.worktreePath, run.baseRevision);
          Object.assign(run, result, git, {
            currentActivity: null,
            completedAt: new Date().toISOString(),
            summary: summaryForRun(request.mode, result, git),
          });
        } catch (error) {
          activeRuns.delete(run.runId);
          Object.assign(run, await readAgentGitState(run.worktreePath, run.baseRevision), {
            status: 'blocked',
            currentActivity: null,
            completedAt: new Date().toISOString(),
            summary: error instanceof Error ? error.message : 'No fue posible ejecutar Codex.',
            warnings: ['El proceso de Codex no pudo iniciarse o persistirse.'],
          });
        }
        await persistRun(run);
        await persistBatch(batchDirectory, batch);
        return run;
      });

      const completion = Promise.all(completions)
        .then(async () => {
          batch.status = statusForBatch(batch.runs);
          batch.completedAt = new Date().toISOString();
          await persistBatch(batchDirectory, batch);
          return batch;
        })
        .finally(() => {
          activeBatches.delete(projectId);
        });

      Object.defineProperty(batch, '__completion', {
        value: completion,
        configurable: true,
        enumerable: false,
      });
      return publicBatch(batch);
    },

    async wait(projectId, batchId) {
      const active = activeBatches.get(projectId);
      if (active?.batchId === batchId && active.__completion) {
        return publicBatch(await active.__completion);
      }
      const batch = await findBatch({ projectId, batchId, runsRoot, activeBatches });
      if (!batch) throw new AgentRunnerError(404, 'batch_not_found', 'El lote no existe.');
      return publicBatch(recoverInterruptedRuns(batch, activeRuns));
    },

    async cancel(projectId, runId) {
      const active = activeBatches.get(projectId);
      if (!active) {
        throw new AgentRunnerError(404, 'active_batch_not_found', 'No hay un lote activo.');
      }
      const run = active.runs.find((candidate) => candidate.runId === runId);
      if (!run) throw new AgentRunnerError(404, 'run_not_found', 'La ejecución no existe.');
      const handle = activeRuns.get(runId);
      if (!handle) {
        throw new AgentRunnerError(409, 'run_not_active', 'La ejecución ya no está activa.');
      }
      run.currentActivity = 'Cancelando';
      handle.cancel();
      return { runId, status: 'cancelling' };
    },
  };
}

function validateLaunchRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AgentRunnerError(422, 'invalid_body', 'Contrato de lanzamiento inválido.');
  }
  const allowed = new Set(['mode', 'tasks']);
  const unknown = Object.keys(input).find((key) => !allowed.has(key));
  if (unknown) throw new AgentRunnerError(422, 'unknown_field', `Campo no permitido: ${unknown}.`);
  if (input.mode !== 'discover' && input.mode !== 'implement') {
    throw new AgentRunnerError(422, 'invalid_mode', 'Modo de agente inválido.');
  }
  if (!Array.isArray(input.tasks) || input.tasks.length === 0 || input.tasks.length > 8) {
    throw new AgentRunnerError(422, 'invalid_tasks', 'El lote debe contener entre 1 y 8 tareas.');
  }
  if (input.mode === 'discover' && input.tasks.length !== 1) {
    throw new AgentRunnerError(422, 'invalid_discovery_batch', 'Descubrimiento acepta una tarea.');
  }

  const tasks = input.tasks.map(validateTask);
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new AgentRunnerError(422, 'duplicate_task', 'El lote contiene ids duplicados.');
  }
  return { mode: input.mode, tasks };
}

function validateTask(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentRunnerError(422, 'invalid_task', 'Tarea inválida.');
  }
  const unknown = Object.keys(value).find((key) => !TASK_KEYS.has(key));
  if (unknown) throw new AgentRunnerError(422, 'unknown_task_field', `Campo no permitido: ${unknown}.`);
  if (typeof value.id !== 'string' || !TASK_ID_PATTERN.test(value.id)) {
    throw new AgentRunnerError(422, 'invalid_task_id', 'Id de tarea inválido.');
  }
  for (const [field, maxLength] of [
    ['title', 160],
    ['route', 220],
    ['objective', 4_000],
  ]) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > maxLength) {
      throw new AgentRunnerError(422, 'invalid_task', `${field} es inválido.`);
    }
  }
  if (
    !Array.isArray(value.criteria) ||
    value.criteria.length < 1 ||
    value.criteria.length > 12 ||
    value.criteria.some((item) => typeof item !== 'string' || !item.trim() || item.length > 300)
  ) {
    throw new AgentRunnerError(422, 'invalid_criteria', 'Criterios inválidos.');
  }
  const sourceFiles = value.sourceFiles ?? [];
  if (
    !Array.isArray(sourceFiles) ||
    sourceFiles.length > 30 ||
    sourceFiles.some((item) => typeof item !== 'string' || !isSafeRelativePath(item))
  ) {
    throw new AgentRunnerError(422, 'invalid_source_files', 'sourceFiles contiene rutas inválidas.');
  }
  const imagePaths = value.imagePaths ?? [];
  if (
    !Array.isArray(imagePaths) ||
    imagePaths.length > 5 ||
    imagePaths.some((item) => typeof item !== 'string' || !path.isAbsolute(item))
  ) {
    throw new AgentRunnerError(422, 'invalid_image_paths', 'imagePaths contiene rutas inválidas.');
  }
  const visualFrames = validateVisualFrames(value.visualFrames ?? [], imagePaths);
  return {
    id: value.id,
    title: value.title.trim(),
    route: value.route.trim(),
    objective: value.objective.trim(),
    criteria: value.criteria.map((item) => item.trim()),
    sourceFiles,
    imagePaths,
    visualFrames,
  };
}

function validateVisualFrames(value, imagePaths) {
  if (!Array.isArray(value) || value.length > 6) {
    throw new AgentRunnerError(422, 'invalid_visual_frames', 'visualFrames es inválido.');
  }
  const ids = new Set();
  return value.map((frame) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      throw new AgentRunnerError(422, 'invalid_visual_frames', 'Un fotograma visual es inválido.');
    }
    const allowed = new Set([
      'id', 'title', 'objective', 'criteria', 'trigger', 'transition', 'durationMs', 'imagePath',
    ]);
    const unknown = Object.keys(frame).find((key) => !allowed.has(key));
    if (unknown) throw new AgentRunnerError(422, 'unknown_field', `Campo visual no permitido: ${unknown}.`);
    if (typeof frame.id !== 'string' || !TASK_ID_PATTERN.test(frame.id) || ids.has(frame.id)) {
      throw new AgentRunnerError(422, 'invalid_visual_frames', 'El id de un fotograma es inválido o está repetido.');
    }
    ids.add(frame.id);
    if (
      typeof frame.title !== 'string' || !frame.title.trim() || frame.title.length > 120 ||
      typeof frame.objective !== 'string' || !frame.objective.trim() || frame.objective.length > 1_200 ||
      !Array.isArray(frame.criteria) || frame.criteria.length < 1 || frame.criteria.length > 12 ||
      frame.criteria.some((criterion) => typeof criterion !== 'string' || !criterion.trim() || criterion.length > 300) ||
      !['initial', 'automatic', 'interaction', 'scroll'].includes(frame.trigger) ||
      typeof frame.transition !== 'string' || frame.transition.length > 240 ||
      !Number.isInteger(frame.durationMs) || frame.durationMs < 0 || frame.durationMs > 10_000 ||
      typeof frame.imagePath !== 'string' || !path.isAbsolute(frame.imagePath) ||
      !imagePaths.includes(frame.imagePath)
    ) {
      throw new AgentRunnerError(422, 'invalid_visual_frames', 'El contrato de un fotograma es inválido.');
    }
    return {
      id: frame.id,
      title: frame.title.trim(),
      objective: frame.objective.trim(),
      criteria: frame.criteria.map((criterion) => criterion.trim()),
      trigger: frame.trigger,
      transition: frame.transition.trim(),
      durationMs: frame.durationMs,
      imagePath: frame.imagePath,
    };
  });
}

async function validateTaskImages(tasks, designsRoot) {
  if (!designsRoot && tasks.some((task) => task.imagePaths.length > 0)) {
    throw new AgentRunnerError(403, 'designs_root_missing', 'No existe raíz de diseños autorizada.');
  }
  if (!designsRoot) return tasks;
  await mkdir(designsRoot, { recursive: true });
  const root = await realpath(designsRoot);
  for (const task of tasks) {
    for (const imagePath of task.imagePaths) {
      let resolved;
      try {
        resolved = await realpath(imagePath);
        const file = await stat(resolved);
        if (!file.isFile()) throw new Error('not_file');
      } catch {
        throw new AgentRunnerError(422, 'image_unavailable', 'Una imagen objetivo no está disponible.');
      }
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new AgentRunnerError(
          403,
          'image_outside_designs',
          'Las imágenes deben pertenecer al almacén visual de Oracle.',
        );
      }
    }
  }
  return tasks;
}

function assertProjectEnabled(project, operation) {
  if (!project.enabled || !project.repoPath) {
    throw new AgentRunnerError(403, project.reasonCode ?? 'runner_disabled', project.reason);
  }
  if (!project.operations.includes(operation)) {
    throw new AgentRunnerError(403, 'operation_not_authorized', 'La operación no está autorizada.');
  }
}

function applyEvent(run, event) {
  if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
    run.threadId = event.thread_id;
  }
  if (event.type === 'item.started' && event.item?.type === 'command_execution') {
    run.currentActivity = 'Ejecutando validación o comando';
  }
  if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
    run.currentActivity = 'Preparando resultado';
  }
  if (event.type === 'turn.completed' && event.usage) run.usage = event.usage;
}

function statusForBatch(runs) {
  if (runs.every((run) => run.status === 'succeeded')) return 'succeeded';
  if (runs.every((run) => run.status === 'cancelled')) return 'cancelled';
  if (runs.some((run) => run.status === 'succeeded')) return 'partial';
  if (runs.some((run) => run.status === 'blocked')) return 'blocked';
  return 'failed';
}

function summaryForRun(mode, result, git) {
  if (result.cancelled) return 'Ejecución cancelada.';
  if (result.timedOut) return `Ejecución bloqueada por timeout (${result.durationMs} ms).`;
  if (result.sandboxHealthy === false) {
    return 'Ejecución bloqueada porque el sandbox de Windows no pudo inicializarse.';
  }
  if (result.status !== 'succeeded') {
    return `Codex terminó con código ${result.exitCode ?? 'desconocido'}.`;
  }
  if (mode === 'discover') return 'Inventario visual generado correctamente.';
  if (git.changesPresent) return `Implementación completada con ${git.changedFiles.length} archivos detectados.`;
  return 'Codex completó la tarea sin cambios detectables en el worktree.';
}

function publicProjectStatus(project, codex = undefined) {
  return {
    projectId: project.projectId,
    name: project.name,
    repo: project.repo,
    enabled: project.enabled,
    reasonCode: project.reasonCode,
    reason: project.reason,
    baseRef: project.baseRef,
    baseRevision: project.baseRevision,
    maxParallel: project.maxParallel,
    operations: project.operations,
    model: project.model,
    ...(codex ? { codex } : {}),
  };
}

function publicBatch(batch) {
  return JSON.parse(JSON.stringify(batch, (key, value) => {
    if (key.startsWith('__')) return undefined;
    if (key === 'stdoutTail') return undefined;
    if (key === 'finalMessage' && typeof value === 'string' && value.length > 2_000) {
      return `${value.slice(0, 2_000)}\n[TRUNCATED]`;
    }
    if (key === 'imagePaths') return value.map((imagePath) => path.basename(imagePath));
    if (key === 'imagePath') return path.basename(value);
    if (key === 'stderrTail') return String(value ?? '').slice(-4_000);
    return value;
  }));
}

function recoverInterruptedRuns(batch, activeRuns) {
  if (!batch || batch.status !== 'running') return batch;
  if (batch.runnerPid && isProcessAlive(batch.runnerPid)) return batch;
  const clone = structuredClone(batch);
  for (const run of clone.runs) {
    if ((run.status === 'running' || run.status === 'preparing') && !activeRuns.has(run.runId)) {
      run.status = 'interrupted';
      run.currentActivity = null;
      run.summary = 'El proceso de Oracle se reinició durante la ejecución.';
    }
  }
  if (clone.runs.some((run) => run.status === 'interrupted')) clone.status = 'interrupted';
  return clone;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function persistBatch(batchDirectory, batch) {
  await mkdir(batchDirectory, { recursive: true });
  await atomicJson(path.join(batchDirectory, 'batch.json'), publicBatch(batch));
}

async function persistRun(run) {
  await mkdir(path.dirname(run.artifactPath), { recursive: true });
  await atomicJson(run.artifactPath, publicBatch(run));
}

async function atomicJson(filePath, value) {
  const previous = atomicWriteQueues.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, filePath);
  });
  atomicWriteQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (atomicWriteQueues.get(filePath) === next) atomicWriteQueues.delete(filePath);
  }
}

async function findLatestBatch({ projectId, runsRoot, activeBatches }) {
  const active = activeBatches.get(projectId);
  if (active) return active;
  const projectRoot = path.join(runsRoot, safeSegment(projectId));
  let entries;
  try {
    entries = await readdir(projectRoot, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && BATCH_ID_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (!candidates[0]) return null;
  return readBatch(path.join(projectRoot, candidates[0], 'batch.json'));
}

async function findBatch({ projectId, batchId, runsRoot, activeBatches }) {
  if (typeof batchId !== 'string' || !BATCH_ID_PATTERN.test(batchId)) {
    throw new AgentRunnerError(422, 'invalid_batch_id', 'Id de lote inválido.');
  }
  const active = activeBatches.get(projectId);
  if (active?.batchId === batchId) return active;
  return readBatch(path.join(runsRoot, safeSegment(projectId), batchId, 'batch.json'));
}

async function readBatch(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

function createBatchId() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isSafeRelativePath(value) {
  if (!value || value.length > 300 || path.isAbsolute(value) || value.includes('\0')) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}

export { AgentRunnerError } from './policy.mjs';
