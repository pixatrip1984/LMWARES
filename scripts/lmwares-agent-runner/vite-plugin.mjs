import { createAgentRunnerService, AgentRunnerError } from './service.mjs';
import { CaptureStoreError, readCaptureAsset, readCaptureManifest } from './capture-store.mjs';
import { CaptureServiceError, createCaptureService } from './capture-service.mjs';
import { createDesignService, DesignServiceError } from './design-service.mjs';
import {
  DesignStoreError,
  readLatestTargets,
  readTargetAsset,
  saveTargetAsset,
} from './design-store.mjs';
import {
  readVisualMap,
  saveVisualMap,
  VisualMapStoreError,
} from './visual-map-store.mjs';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function lmwaresAgentRunnerPlugin(options) {
  return {
    name: 'lmwares-agent-runner',
    apply: 'serve',
    configureServer(server) {
      const runner = createAgentRunnerService(options);
      const designer = createDesignService({
        designsRoot: options.designsRoot,
        runsRoot: options.designRunsRoot,
        codexCommand: options.designCodexCommand,
        timeoutMs: options.designTimeoutMs,
      });
      const capturer = createCaptureService({
        designsRoot: options.designsRoot,
        browserExecutable: options.captureBrowserExecutable,
      });
      const port = Number(server.config.server.port ?? 5274);
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
        if (!url.pathname.startsWith('/__lmwares/agents/')) {
          next();
          return;
        }

        try {
          assertLoopback(request, allowedHosts);

          if (url.pathname === '/__lmwares/agents/status' && request.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            const batchId = url.searchParams.get('batchId');
            sendJson(response, 200, await runner.status(projectId, batchId));
            return;
          }

          if (url.pathname === '/__lmwares/agents/doctor' && request.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            sendJson(response, 200, await runner.doctor(projectId));
            return;
          }

          if (url.pathname === '/__lmwares/agents/captures' && request.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            const manifest = await readCaptureManifest({
              designsRoot: options.designsRoot,
              projectId,
            });
            sendJson(response, 200, {
              ...manifest,
              captures: manifest.captures.map(({ file: _file, ...capture }) => ({
                ...capture,
                imageUrl: captureUrl(projectId, capture.screenId, capture.frameId),
              })),
            });
            return;
          }

          if (url.pathname === '/__lmwares/agents/capture' && request.method === 'GET') {
            const asset = await readCaptureAsset({
              designsRoot: options.designsRoot,
              projectId: url.searchParams.get('projectId'),
              screenId: url.searchParams.get('screenId'),
              frameId: url.searchParams.get('frameId') ?? 'primary',
            });
            sendImage(response, asset.contentType, asset.body);
            return;
          }

          if (url.pathname === '/__lmwares/agents/capture/run' && request.method === 'POST') {
            assertMutationRequest(request, allowedOrigins);
            const body = await readJsonBody(request);
            if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.projectId !== 'string') {
              throw new CaptureServiceError(422, 'invalid_capture_request', 'projectId es obligatorio.');
            }
            const { projectId, ...input } = body;
            const capture = await capturer.capture(projectId, input);
            sendJson(response, 201, {
              ...capture,
              imageUrl: captureUrl(projectId, capture.screenId, capture.frameId),
            });
            return;
          }

          if (url.pathname === '/__lmwares/agents/targets' && request.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            const manifest = await readLatestTargets({ designsRoot: options.designsRoot, projectId });
            sendJson(response, 200, {
              ...manifest,
              targets: manifest.targets.map((target) => withTargetUrl(target, projectId)),
            });
            return;
          }

          if (url.pathname === '/__lmwares/agents/map' && request.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            sendJson(response, 200, {
              map: await readVisualMap({ designsRoot: options.designsRoot, projectId }),
            });
            return;
          }

          if (url.pathname === '/__lmwares/agents/map' && request.method === 'POST') {
            assertMutationRequest(request, allowedOrigins);
            const body = await readJsonBody(request);
            if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.projectId !== 'string') {
              throw new VisualMapStoreError(422, 'invalid_visual_map', 'projectId es obligatorio.');
            }
            const { projectId, selectedScreenId, screens } = body;
            sendJson(response, 200, {
              map: await saveVisualMap({
                designsRoot: options.designsRoot,
                projectId,
                selectedScreenId,
                screens,
              }),
            });
            return;
          }

          if (url.pathname === '/__lmwares/agents/target' && request.method === 'GET') {
            const versionValue = url.searchParams.get('version');
            const asset = await readTargetAsset({
              designsRoot: options.designsRoot,
              projectId: url.searchParams.get('projectId'),
              screenId: url.searchParams.get('screenId'),
              frameId: url.searchParams.get('frameId') ?? 'primary',
              version: versionValue === null ? undefined : Number(versionValue),
            });
            sendImage(response, asset.contentType, asset.body);
            return;
          }

          if (url.pathname === '/__lmwares/agents/design/status' && request.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            const jobId = url.searchParams.get('jobId');
            const job = await designer.status(projectId, jobId);
            sendJson(response, 200, withJobTargetUrl(job));
            return;
          }

          if (url.pathname === '/__lmwares/agents/design/generate' && request.method === 'POST') {
            assertMutationRequest(request, allowedOrigins);
            const body = await readJsonBody(request);
            if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.projectId !== 'string') {
              throw new DesignServiceError(422, 'invalid_design_request', 'projectId es obligatorio.');
            }
            const { projectId, ...input } = body;
            sendJson(response, 202, await designer.generate(projectId, input));
            return;
          }

          if (url.pathname === '/__lmwares/agents/design/cancel' && request.method === 'POST') {
            assertMutationRequest(request, allowedOrigins);
            const body = await readJsonBody(request);
            if (!body || typeof body.projectId !== 'string' || typeof body.jobId !== 'string') {
              throw new DesignServiceError(422, 'invalid_design_request', 'projectId y jobId son obligatorios.');
            }
            sendJson(response, 202, await designer.cancel(body.projectId, body.jobId));
            return;
          }

          if (url.pathname === '/__lmwares/agents/target/upload' && request.method === 'POST') {
            assertMutationRequest(request, allowedOrigins, ['image/png', 'image/jpeg']);
            const projectId = url.searchParams.get('projectId');
            const screenId = url.searchParams.get('screenId');
            const frameId = url.searchParams.get('frameId') ?? 'primary';
            const contentType = String(request.headers['content-type'] ?? '').toLowerCase().split(';')[0];
            const target = await saveTargetAsset({
              designsRoot: options.designsRoot,
              projectId,
              screenId,
              frameId,
              body: await readBody(request, MAX_IMAGE_BYTES),
              contentType,
              source: 'uploaded',
            });
            sendJson(response, 201, withTargetUrl(target, projectId));
            return;
          }

          if (url.pathname === '/__lmwares/agents/launch' && request.method === 'POST') {
            assertMutationRequest(request, allowedOrigins);
            const body = await readJsonBody(request);
            const { projectId, ...input } = assertLaunchBody(body);
            sendJson(response, 202, await runner.launch(projectId, input));
            return;
          }

          if (url.pathname === '/__lmwares/agents/cancel' && request.method === 'POST') {
            assertMutationRequest(request, allowedOrigins);
            const body = await readJsonBody(request);
            assertCancelBody(body);
            sendJson(response, 202, await runner.cancel(body.projectId, body.runId));
            return;
          }

          sendJson(response, 405, { error: 'method_not_allowed' });
        } catch (error) {
          if (
            error instanceof AgentRunnerError ||
            error instanceof CaptureStoreError ||
            error instanceof CaptureServiceError ||
            error instanceof DesignServiceError ||
            error instanceof DesignStoreError ||
            error instanceof VisualMapStoreError
          ) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          console.error('lmwares agent runner failed', error);
          sendJson(response, 500, {
            error: 'agent_runner_internal_error',
            message: 'El ejecutor local de agentes no pudo completar la solicitud.',
          });
        }
      });
    },
  };
}

function captureUrl(projectId, screenId, frameId = 'primary') {
  const query = new URLSearchParams({ projectId, screenId });
  if (frameId && frameId !== 'primary') query.set('frameId', frameId);
  return `/__lmwares/agents/capture?${query}`;
}

function assertLoopback(request, allowedHosts) {
  const host = String(request.headers.host ?? '').toLowerCase();
  if (!allowedHosts.has(host)) {
    throw new AgentRunnerError(403, 'invalid_host', 'El ejecutor solo acepta loopback local.');
  }
}

function assertMutationRequest(request, allowedOrigins, contentTypes = ['application/json']) {
  const origin = String(request.headers.origin ?? '');
  if (!allowedOrigins.has(origin)) {
    throw new AgentRunnerError(403, 'invalid_origin', 'Origen no autorizado.');
  }
  if (request.headers['x-lmwares-agents'] !== '1') {
    throw new AgentRunnerError(403, 'agent_header_missing', 'Falta la cabecera del ejecutor.');
  }
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  if (!contentTypes.some((allowed) => contentType.startsWith(allowed))) {
    throw new AgentRunnerError(415, 'unsupported_media_type', 'Tipo de contenido no admitido.');
  }
}

async function readJsonBody(request) {
  const body = await readBody(request, MAX_BODY_BYTES);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new AgentRunnerError(422, 'invalid_json', 'Cuerpo JSON inválido.');
  }
}

async function readBody(request, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limitBytes) {
      throw new AgentRunnerError(413, 'body_too_large', 'La solicitud excede el límite permitido.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function assertLaunchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentRunnerError(422, 'invalid_body', 'Contrato inválido.');
  }
  const allowed = new Set(['projectId', 'mode', 'tasks']);
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) throw new AgentRunnerError(422, 'unknown_field', `Campo no permitido: ${unknown}.`);
  if (typeof body.projectId !== 'string') {
    throw new AgentRunnerError(422, 'invalid_project_id', 'projectId es obligatorio.');
  }
  return body;
}

function assertCancelBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentRunnerError(422, 'invalid_body', 'Contrato inválido.');
  }
  const allowed = new Set(['projectId', 'runId']);
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) throw new AgentRunnerError(422, 'unknown_field', `Campo no permitido: ${unknown}.`);
  if (typeof body.projectId !== 'string' || typeof body.runId !== 'string') {
    throw new AgentRunnerError(422, 'invalid_body', 'projectId y runId son obligatorios.');
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

function sendImage(response, contentType, body) {
  response.statusCode = 200;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', String(body.length));
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(body);
}

function withTargetUrl(target, projectId) {
  return {
    ...target,
    imageUrl: `/__lmwares/agents/target?projectId=${encodeURIComponent(projectId)}&screenId=${encodeURIComponent(target.screenId)}&frameId=${encodeURIComponent(target.frameId ?? 'primary')}&version=${target.version}`,
  };
}

function withJobTargetUrl(job) {
  return job.target ? { ...job, target: withTargetUrl(job.target, job.projectId) } : job;
}
