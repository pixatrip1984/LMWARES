import { createRunnerService, RunnerError } from './service.mjs';

const MAX_BODY_BYTES = 4_096;

export function lmwaresRunnerPlugin(options) {
  return {
    name: 'lmwares-local-runner',
    apply: 'serve',
    configureServer(server) {
      const runner = createRunnerService(options);
      const port = Number(server.config.server.port ?? 5274);
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
        if (!url.pathname.startsWith('/__lmwares/runner/')) {
          next();
          return;
        }

        try {
          const host = String(request.headers.host ?? '').toLowerCase();
          if (!allowedHosts.has(host)) {
            throw new RunnerError(403, 'invalid_host', 'El runner solo acepta loopback local.');
          }

          if (url.pathname === '/__lmwares/runner/status' && request.method === 'GET') {
            const projectId = url.searchParams.get('projectId');
            sendJson(response, 200, await runner.status(projectId));
            return;
          }

          if (url.pathname === '/__lmwares/runner/run' && request.method === 'POST') {
            assertSameOriginRequest(request, allowedOrigins);
            const body = await readJsonBody(request);
            assertRunBody(body);
            sendJson(response, 200, await runner.run(body.projectId, body.validatorId));
            return;
          }

          sendJson(response, 405, { error: 'method_not_allowed' });
        } catch (error) {
          if (error instanceof RunnerError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          console.error('lmwares runner failed', error);
          sendJson(response, 500, {
            error: 'runner_internal_error',
            message: 'El runner local no pudo completar la solicitud.',
          });
        }
      });
    },
  };
}

function assertSameOriginRequest(request, allowedOrigins) {
  const origin = String(request.headers.origin ?? '');
  if (!allowedOrigins.has(origin)) {
    throw new RunnerError(403, 'invalid_origin', 'Origen no autorizado para el runner local.');
  }
  if (request.headers['x-lmwares-runner'] !== '1') {
    throw new RunnerError(403, 'runner_header_missing', 'Falta la cabecera local del runner.');
  }
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new RunnerError(415, 'unsupported_media_type', 'El runner solo acepta JSON.');
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new RunnerError(413, 'body_too_large', 'La solicitud excede 4 KiB.');
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RunnerError(422, 'invalid_json', 'Cuerpo JSON inválido.');
  }
}

function assertRunBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RunnerError(422, 'invalid_body', 'Contrato del runner inválido.');
  }
  const allowedKeys = new Set(['projectId', 'validatorId']);
  const unknown = Object.keys(body).find((key) => !allowedKeys.has(key));
  if (unknown) {
    throw new RunnerError(422, 'unknown_field', `Campo no permitido: ${unknown}.`);
  }
  if (typeof body.projectId !== 'string' || typeof body.validatorId !== 'string') {
    throw new RunnerError(422, 'invalid_body', 'projectId y validatorId son obligatorios.');
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}
