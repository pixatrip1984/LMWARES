import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readCaptureManifest } from './capture-store.mjs';
import { readLatestTargets, saveTargetAsset } from './design-store.mjs';
import { startCodexAgent } from './execute.mjs';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const ACTIVE_STATUSES = new Set(['queued', 'running']);

export class DesignServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'DesignServiceError';
    this.status = status;
    this.code = code;
  }
}

export function createDesignService({
  designsRoot,
  runsRoot,
  codexCommand,
  timeoutMs = 15 * 60 * 1000,
  now = () => new Date(),
}) {
  if (!path.isAbsolute(designsRoot) || !path.isAbsolute(runsRoot)) {
    throw new Error('designsRoot y runsRoot deben ser rutas absolutas.');
  }
  const active = new Map();

  return {
    async generate(projectId, input) {
      const request = validateGeneration(projectId, input);
      const activeKey = `${projectId}:${request.screenId}`;
      const current = active.get(activeKey);
      if (current) {
        throw new DesignServiceError(409, 'design_generation_active', 'Esta pantalla ya está generando un objetivo.');
      }

      const createdAt = now().toISOString();
      const jobId = `${createdAt.replace(/[-:.]/g, '').replace('Z', 'Z')}-${randomUUID().slice(0, 8)}`;
      const jobDirectory = path.join(runsRoot, projectId, jobId);
      const prompt = buildDesignPrompt(request);
      const job = {
        schemaVersion: 1,
        jobId,
        projectId,
        screenId: request.screenId,
        frameId: request.frameId,
        title: request.title,
        status: 'queued',
        currentActivity: 'Preparando referencia visual',
        createdAt,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        threadId: null,
        target: null,
        summary: '',
        warnings: [],
        stderrTail: '',
        promptSha256: sha256(prompt),
      };
      await mkdir(jobDirectory, { recursive: true });
      await persistJob(jobDirectory, job);
      const execution = { job, jobDirectory, cancel: null };
      active.set(activeKey, execution);
      void executeGeneration({
        execution,
        request,
        prompt,
        designsRoot,
        codexCommand,
        timeoutMs,
        now,
      }).finally(() => active.delete(activeKey));
      return publicJob(job);
    },

    async status(projectId, jobId) {
      assertId(projectId, 'projectId');
      assertId(jobId, 'jobId', 140);
      const live = [...active.values()].find(
        (entry) => entry.job.projectId === projectId && entry.job.jobId === jobId,
      );
      if (live) return publicJob(live.job);
      const jobDirectory = path.join(runsRoot, projectId, jobId);
      let job;
      try {
        job = JSON.parse(await readFile(path.join(jobDirectory, 'status.json'), 'utf8'));
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          throw new DesignServiceError(404, 'design_job_not_found', 'La generación visual no existe.');
        }
        throw error;
      }
      if (ACTIVE_STATUSES.has(job.status)) {
        job.status = 'interrupted';
        job.currentActivity = null;
        job.completedAt = now().toISOString();
        job.summary = 'La sesión local terminó antes de completar la generación.';
        await persistJob(jobDirectory, job);
      }
      return publicJob(job);
    },

    async cancel(projectId, jobId) {
      assertId(projectId, 'projectId');
      assertId(jobId, 'jobId', 140);
      const live = [...active.values()].find(
        (entry) => entry.job.projectId === projectId && entry.job.jobId === jobId,
      );
      if (!live || !live.cancel) {
        throw new DesignServiceError(409, 'design_job_not_active', 'La generación visual ya no está activa.');
      }
      live.job.currentActivity = 'Cancelando generación';
      await persistJob(live.jobDirectory, live.job);
      live.cancel();
      return { jobId, status: 'cancelling' };
    },

    async wait(projectId, jobId) {
      for (;;) {
        const job = await this.status(projectId, jobId);
        if (!ACTIVE_STATUSES.has(job.status)) return job;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    },
  };
}

async function executeGeneration({
  execution,
  request,
  prompt,
  designsRoot,
  codexCommand,
  timeoutMs,
  now,
}) {
  const { job, jobDirectory } = execution;
  const startedTick = Date.now();
  try {
    const captures = await readCaptureManifest({ designsRoot, projectId: job.projectId });
    const capture =
      captures.captures.find(
        (entry) => entry.screenId === job.screenId && entry.frameId === job.frameId,
      ) ??
      captures.captures.find(
        (entry) => entry.screenId === job.screenId && entry.frameId === 'primary',
      );
    const imagePaths = [];
    if (capture) {
      const extension = path.extname(capture.imagePath).toLowerCase() || '.jpg';
      const referencePath = path.join(jobDirectory, `.reference${extension}`);
      await copyFile(capture.imagePath, referencePath);
      imagePaths.push(referencePath);
    }
    const previousTargets = await readLatestTargets({ designsRoot, projectId: job.projectId });
    for (const target of previousTargets.targets
      .filter((entry) => entry.screenId === job.screenId)
      .sort((left, right) => left.frameId.localeCompare(right.frameId))
      .slice(0, 4)) {
      const extension = path.extname(target.imagePath).toLowerCase() || '.png';
      const sequencePath = path.join(jobDirectory, `.sequence-${target.frameId}${extension}`);
      await copyFile(target.imagePath, sequencePath);
      imagePaths.push(sequencePath);
    }

    job.status = 'running';
    job.startedAt = now().toISOString();
    job.currentActivity = imagePaths.length > 0 ? 'Generando desde la captura actual' : 'Generando diseño inicial';
    await persistJob(jobDirectory, job);

    const agent = await startCodexAgent({
      run: { worktreePath: jobDirectory },
      prompt,
      operation: 'implement',
      imagePaths,
      runDirectory: jobDirectory,
      codexCommand,
      timeoutMs,
      skipGitRepoCheck: true,
      onEvent(event) {
        const activity = activityFor(event);
        if (activity) job.currentActivity = activity;
      },
    });
    execution.cancel = agent.cancel;
    const result = await agent.completion;
    job.threadId = result.threadId;
    job.warnings = result.warnings;
    job.stderrTail = result.stderrTail;
    job.summary = result.finalMessage || '';

    if (result.cancelled) {
      job.status = 'cancelled';
    } else if (result.timedOut || result.spawnError) {
      job.status = 'blocked';
    } else {
      const generatedPath = await findGeneratedImage({
        jobDirectory,
        threadId: result.threadId,
        notBefore: startedTick,
      });
      if (result.exitCode !== 0 || !generatedPath) {
        job.status = 'failed';
        if (!generatedPath) job.summary = 'Codex terminó sin producir una imagen objetivo utilizable.';
      } else {
        const generated = await readFile(generatedPath);
        const target = await saveTargetAsset({
          designsRoot,
          projectId: job.projectId,
          screenId: job.screenId,
          frameId: job.frameId,
          body: generated,
          source: 'imagegen',
          promptSha256: job.promptSha256,
          threadId: result.threadId,
          createdAt: now().toISOString(),
        });
        job.target = target;
        job.status = 'succeeded';
        job.summary = `Objetivo visual v${target.version} generado.`;
      }
    }
  } catch (error) {
    job.status = 'failed';
    job.summary = error instanceof Error ? error.message : 'La generación visual falló.';
  } finally {
    job.currentActivity = null;
    job.completedAt = now().toISOString();
    job.durationMs = Math.max(0, Date.now() - startedTick);
    await persistJob(jobDirectory, job);
  }
}

function validateGeneration(projectId, input) {
  assertId(projectId, 'projectId');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DesignServiceError(422, 'invalid_design_request', 'La solicitud de diseño es inválida.');
  }
  const allowed = new Set([
    'screenId',
    'frameId',
    'frameTitle',
    'title',
    'route',
    'objective',
    'instruction',
    'criteria',
    'trigger',
    'transition',
    'durationMs',
  ]);
  const unknown = Object.keys(input).find((key) => !allowed.has(key));
  if (unknown) throw new DesignServiceError(422, 'unknown_field', `Campo no permitido: ${unknown}.`);
  assertId(input.screenId, 'screenId');
  const frameId = typeof input.frameId === 'string' ? input.frameId : 'primary';
  assertId(frameId, 'frameId');
  const frameTitle = cleanText(input.frameTitle ?? 'Principal', 'frameTitle', 100);
  const title = cleanText(input.title, 'title', 120);
  const route = cleanText(input.route, 'route', 180);
  const objective = cleanText(input.objective, 'objective', 1200);
  const instruction = cleanText(input.instruction, 'instruction', 1200);
  if (!Array.isArray(input.criteria) || input.criteria.length < 1 || input.criteria.length > 12) {
    throw new DesignServiceError(422, 'invalid_criteria', 'Incluye entre 1 y 12 criterios de aceptación.');
  }
  const criteria = input.criteria.map((value) => cleanText(value, 'criterion', 240));
  const trigger = ['initial', 'automatic', 'interaction', 'scroll'].includes(input.trigger)
    ? input.trigger
    : frameId === 'primary'
      ? 'initial'
      : 'automatic';
  const transition = frameId === 'primary' ? '' : cleanText(input.transition ?? 'Fundido suave', 'transition', 240);
  const durationMs = frameId === 'primary' ? 0 : Number(input.durationMs ?? 600);
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 10_000) {
    throw new DesignServiceError(422, 'invalid_duration', 'La duración de la transición es inválida.');
  }
  return {
    screenId: input.screenId,
    frameId,
    frameTitle,
    title,
    route,
    objective,
    instruction,
    criteria,
    trigger,
    transition,
    durationMs,
  };
}

function buildDesignPrompt(request) {
  const criteria = request.criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
  return `Usa $imagegen para crear exactamente una imagen objetivo de interfaz web para LMWARES Oracle.

Pantalla: ${request.title}
Ruta: ${request.route}
Fotograma: ${request.frameTitle} (${request.frameId})
Entrada: ${request.trigger}
Transición desde el fotograma anterior: ${request.transition || 'Estado inicial'}
Duración prevista: ${request.durationMs} ms

Objetivo:
${request.objective}

Instrucción específica de esta generación:
${request.instruction}

Criterios observables:
${criteria}

Dirección obligatoria:
- Tipo de trabajo: UI mockup comercial de alta fidelidad.
- Si hay una captura adjunta, úsala como referencia estructural del producto actual, no como resultado final.
- Las referencias de secuencia adjuntas pertenecen a la misma tarea: conserva marca, composición y continuidad entre estados.
- Representa únicamente el fotograma solicitado; el movimiento se implementará usando el contrato de transición.
- Conserva la identidad, el idioma, el contenido útil y la función real de la pantalla.
- Mejora jerarquía, composición, legibilidad y claridad de acciones sin inventar otra marca.
- Renderiza una sola pantalla desktop completa en relación 16:9, sin marco de navegador, sin anotaciones y sin texto explicativo fuera de la interfaz.
- No escribas ni modifiques código. No uses subagentes.
- Sigue completamente la skill imagegen y genera una única imagen final. No generes variaciones adicionales.
`;
}

async function findGeneratedImage({ jobDirectory, threadId, notBefore }) {
  const candidates = [];
  if (threadId) {
    const codexHome = process.env.CODEX_HOME || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.codex') : null);
    if (codexHome) {
      await collectImages(path.join(codexHome, 'generated_images', threadId), candidates, notBefore);
    }
  }
  await collectImages(jobDirectory, candidates, notBefore, true);
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.filePath ?? null;
}

async function collectImages(directory, candidates, notBefore, excludeReferences = false) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:png|jpe?g)$/i.test(entry.name)) continue;
    if (excludeReferences && /reference|sequence/i.test(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    const metadata = await stat(filePath);
    if (metadata.mtimeMs + 5_000 < notBefore) continue;
    candidates.push({ filePath, mtimeMs: metadata.mtimeMs });
  }
}

function activityFor(event) {
  if (event?.type === 'thread.started') return 'Imagegen preparando la composición';
  if (event?.type === 'turn.started') return 'Imagegen trabajando';
  if (event?.type === 'item.started' && event?.item?.type === 'mcp_tool_call') return 'Generando imagen objetivo';
  return null;
}

function cleanText(value, label, maxLength) {
  if (typeof value !== 'string') throw new DesignServiceError(422, `invalid_${label}`, `${label} es obligatorio.`);
  const clean = value.trim();
  if (!clean || clean.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean)) {
    throw new DesignServiceError(422, `invalid_${label}`, `${label} es inválido.`);
  }
  return clean;
}

function assertId(value, label, maxLength = 100) {
  if (typeof value !== 'string' || value.length > maxLength || !ID_PATTERN.test(value)) {
    throw new DesignServiceError(422, `invalid_${label.replace('Id', '_id')}`, `${label} es inválido.`);
  }
}

function publicJob(job) {
  return {
    jobId: job.jobId,
    projectId: job.projectId,
    screenId: job.screenId,
    frameId: job.frameId,
    title: job.title,
    status: job.status,
    currentActivity: job.currentActivity,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationMs: job.durationMs,
    threadId: job.threadId,
    target: job.target,
    summary: job.summary,
    warnings: job.warnings,
  };
}

async function persistJob(directory, job) {
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, 'status.json');
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(job, null, 2)}\n`, { flag: 'wx' });
  await rename(temporaryPath, filePath);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
