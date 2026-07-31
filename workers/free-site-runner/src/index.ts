import type {
  FileAsset,
  FreeContactMethod,
  FreeGenerationJob,
  FreeIntake,
  FreeIntakeAsset,
} from '@starter/domain';
import {
  buildManifest,
  renderSite,
  type GeneratedFreeAsset,
} from '../../../scripts/lmwares-free-site-runner/generator.mjs';

const MIN_IMAGE_DIMENSION = 64;
const MAX_IMAGE_DIMENSION = 8_000;
const MAX_IMAGE_PIXELS = 32_000_000;
const SOURCE_MAX_BYTES = 5 * 1024 * 1024;
const OUTPUT_MAX_DIMENSION = 2_400;
const QUEUE_RETRY_SECONDS = 130;
const MAX_QUEUE_ATTEMPTS = 5;
const ALLOWED_IMAGE_FORMATS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'jpeg',
  'png',
  'webp',
]);

interface FreeRunnerQueueMessage {
  kind: 'free-intake-submitted' | 'notification-retry' | 'scheduled-sweep';
  intakeId?: string;
  jobId?: string;
}

type RunnerEnv = Env & {
  FREE_RUNNER_TOKEN: string;
  FREE_RUNNER_QUEUE: Queue<FreeRunnerQueueMessage>;
  IMAGES: ImagesBinding;
  PUBLIC_API: Fetcher;
  PUBLIC_API_URL: string;
};

interface ClaimedAsset {
  asset: FreeIntakeAsset;
  fileAsset: FileAsset;
  sanitized: GeneratedFreeAsset | null;
  sourcePath: string;
}

interface ClaimedJobResponse {
  job: FreeGenerationJob | null;
  intake?: FreeIntake;
  contacts?: FreeContactMethod[];
  assets?: ClaimedAsset[];
}

interface NotificationDispatchResponse {
  notification: {
    status?: string;
    nextAttemptAt?: string | null;
  } | null;
  retryScheduled?: boolean;
}

class PermanentFreeJobError extends Error {}
class TerminalQueueError extends Error {}

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'lmwares-free-site-runner' });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  },

  async scheduled(_controller, env): Promise<void> {
    await env.FREE_RUNNER_QUEUE.send({ kind: 'scheduled-sweep' });
  },

  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processWakeup(env, message);
        message.ack();
      } catch (error) {
        logError('free_runner_queue_failed', error, {
          messageId: message.id,
          attempt: message.attempts,
        });
        if (error instanceof TerminalQueueError || message.attempts >= MAX_QUEUE_ATTEMPTS) {
          message.ack();
        } else {
          message.retry({ delaySeconds: QUEUE_RETRY_SECONDS });
        }
      }
    }
  },
} satisfies ExportedHandler<RunnerEnv, FreeRunnerQueueMessage>;

async function processWakeup(
  env: RunnerEnv,
  message: Message<FreeRunnerQueueMessage>,
): Promise<void> {
  const runnerId = `cloudflare-queue-${message.id}`.slice(0, 120);
  const claimed = parseClaimedJob(
    await apiJson(env, '/internal/free-jobs/claim', {
      method: 'POST',
      body: JSON.stringify({ runnerId }),
    }, runnerId),
  );

  if (!claimed.job) {
    await dispatchNotification(env, runnerId);
    logInfo('free_runner_idle', { messageId: message.id });
    return;
  }

  const { job } = claimed;
  try {
    const intake = claimed.intake;
    const contacts = claimed.contacts;
    const assets = claimed.assets;
    if (!intake || !contacts || !assets || assets.length < 1) {
      throw new PermanentFreeJobError('El job Free reclamado está incompleto.');
    }

    const sanitizedAssets: GeneratedFreeAsset[] = [];
    for (const entry of assets) {
      sanitizedAssets.push(
        entry.sanitized ?? await sanitizeAndUpload(env, runnerId, job.id, entry),
      );
    }

    const manifest = buildManifest({ job, intake, contacts, assets: sanitizedAssets });
    const indexHtml = renderSite({
      intake,
      contacts,
      assets: sanitizedAssets,
      manifest,
      apiUrl: env.PUBLIC_API_URL,
    });
    await apiJson(env, `/internal/free-jobs/${encodeURIComponent(job.id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ runnerId, indexHtml, manifest }),
    }, runnerId);

    logInfo('free_runner_published', {
      intakeId: intake.id,
      jobId: job.id,
      slug: intake.slug,
      messageId: message.id,
    });
  } catch (error) {
    const terminal =
      error instanceof PermanentFreeJobError ||
      message.attempts >= MAX_QUEUE_ATTEMPTS;
    if (terminal) {
      await failJob(env, runnerId, job.id, error);
      throw new TerminalQueueError(errorMessage(error));
    }
    throw error;
  }

  await dispatchNotification(env, runnerId);
}

async function sanitizeAndUpload(
  env: RunnerEnv,
  runnerId: string,
  jobId: string,
  entry: ClaimedAsset,
): Promise<GeneratedFreeAsset> {
  const source = await apiFetch(env, entry.sourcePath, {
    method: 'GET',
    headers: { Accept: 'image/*' },
  }, runnerId);
  const declaredLength = Number(source.headers.get('Content-Length') ?? '0');
  if (declaredLength > SOURCE_MAX_BYTES) {
    throw new PermanentFreeJobError('La imagen original supera el máximo de 5 MB.');
  }

  const bytes = await source.arrayBuffer();
  if (bytes.byteLength <= 0 || bytes.byteLength > SOURCE_MAX_BYTES) {
    throw new PermanentFreeJobError('La imagen original tiene un tamaño inválido.');
  }

  let info: ImageInfoResponse;
  try {
    info = await env.IMAGES.info(streamFor(bytes));
  } catch (error) {
    throw new PermanentFreeJobError(`Cloudflare no reconoció la imagen: ${errorMessage(error)}`);
  }
  if (!('width' in info) || !('height' in info)) {
    throw new PermanentFreeJobError('La imagen no es JPG, PNG o WebP válido.');
  }
  if (!ALLOWED_IMAGE_FORMATS.has(info.format)) {
    throw new PermanentFreeJobError('La imagen no es JPG, PNG o WebP válido.');
  }
  assertImageDimensions(info.width, info.height);

  const transformed = await env.IMAGES
    .input(streamFor(bytes))
    .transform({
      width: OUTPUT_MAX_DIMENSION,
      height: OUTPUT_MAX_DIMENSION,
      fit: 'scale-down',
    })
    .output({
      format: 'image/webp',
      quality: 84,
      anim: false,
    });
  const output = transformed.response();
  if (!output.body) throw new Error('Cloudflare Images devolvió una respuesta vacía.');

  const path =
    `/internal/free-jobs/${encodeURIComponent(jobId)}` +
    `/assets/${encodeURIComponent(entry.asset.id)}/sanitized`;
  const uploaded = await apiJson(env, path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/webp',
      Accept: 'application/json',
    },
    body: output.body,
  }, runnerId);
  return parseGeneratedAsset(uploaded);
}

async function dispatchNotification(env: RunnerEnv, runnerId: string): Promise<void> {
  const raw = await apiJson(env, '/internal/free-notifications/dispatch', {
    method: 'POST',
    body: JSON.stringify({ runnerId }),
  }, runnerId);
  const result = parseNotificationDispatch(raw);
  if (!result.retryScheduled || !result.notification?.nextAttemptAt) return;

  const retryAt = Date.parse(result.notification.nextAttemptAt);
  const delaySeconds = Number.isFinite(retryAt)
    ? Math.max(1, Math.min(86_400, Math.ceil((retryAt - Date.now()) / 1_000)))
    : 60;
  await env.FREE_RUNNER_QUEUE.send(
    { kind: 'notification-retry' },
    { delaySeconds },
  );
}

async function failJob(
  env: RunnerEnv,
  runnerId: string,
  jobId: string,
  error: unknown,
): Promise<void> {
  try {
    await apiJson(env, `/internal/free-jobs/${encodeURIComponent(jobId)}/fail`, {
      method: 'POST',
      body: JSON.stringify({
        runnerId,
        code: error instanceof PermanentFreeJobError
          ? 'free_image_rejected'
          : 'free_runner_failed',
        message: errorMessage(error).slice(0, 500),
      }),
    }, runnerId);
  } catch (failError) {
    logError('free_runner_fail_job_failed', failError, { jobId });
  }
}

async function apiJson(
  env: RunnerEnv,
  path: string,
  init: RequestInit,
  runnerId: string,
): Promise<unknown> {
  const response = await apiFetch(env, path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headersRecord(init.headers),
    },
  }, runnerId);
  const text = await response.text();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw new Error('La API interna devolvió JSON inválido.');
  }
}

async function apiFetch(
  env: RunnerEnv,
  path: string,
  init: RequestInit,
  runnerId: string,
): Promise<Response> {
  const url = new URL(path, `${env.PUBLIC_API_URL.replace(/\/$/, '')}/`);
  const request = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.FREE_RUNNER_TOKEN}`,
      'X-LMWares-Runner-Id': runnerId,
      ...headersRecord(init.headers),
    },
  });
  const response = await env.PUBLIC_API.fetch(request);
  if (response.ok) return response;

  const text = await response.text();
  let message = `La API interna respondió HTTP ${response.status}.`;
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string') {
        message = parsed.error.message;
      }
    } catch {
      // La respuesta HTTP sigue siendo suficiente para diagnóstico.
    }
  }
  throw new Error(message);
}

function parseClaimedJob(value: unknown): ClaimedJobResponse {
  if (!isRecord(value) || !('job' in value)) {
    throw new Error('La API interna no devolvió un job Free válido.');
  }
  if (value.job === null) return { job: null };
  if (
    !isFreeGenerationJob(value.job) ||
    !isFreeIntake(value.intake) ||
    !Array.isArray(value.contacts) ||
    !value.contacts.every(isFreeContactMethod) ||
    !Array.isArray(value.assets) ||
    !value.assets.every(isClaimedAsset)
  ) {
    throw new Error('La API interna devolvió un job Free incompleto.');
  }
  return {
    job: value.job,
    intake: value.intake,
    contacts: value.contacts,
    assets: value.assets,
  };
}

function parseGeneratedAsset(value: unknown): GeneratedFreeAsset {
  if (!isGeneratedFreeAsset(value)) {
    throw new Error('La API interna no confirmó el derivado saneado.');
  }
  return value;
}

function parseNotificationDispatch(value: unknown): NotificationDispatchResponse {
  if (!isRecord(value) || !('notification' in value)) {
    throw new Error('La API interna no devolvió el estado de la notificación.');
  }
  if (value.notification === null) {
    return {
      notification: null,
      retryScheduled: value.retryScheduled === true,
    };
  }
  if (!isRecord(value.notification)) {
    throw new Error('La API interna devolvió una notificación inválida.');
  }
  return {
    notification: {
      status: typeof value.notification.status === 'string'
        ? value.notification.status
        : undefined,
      nextAttemptAt: typeof value.notification.nextAttemptAt === 'string'
        ? value.notification.nextAttemptAt
        : null,
    },
    retryScheduled: value.retryScheduled === true,
  };
}

function assertImageDimensions(width: number, height: number): void {
  const pixels = width * height;
  if (
    width < MIN_IMAGE_DIMENSION ||
    height < MIN_IMAGE_DIMENSION ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new PermanentFreeJobError(
      `Dimensiones no permitidas: ${width}×${height}px.`,
    );
  }
}

function streamFor(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
  return new Blob([bytes]).stream();
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFreeGenerationJob(value: unknown): value is FreeGenerationJob {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.intakeId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.status === 'string' &&
    typeof value.attempt === 'number' &&
    isRecord(value.metadata)
  );
}

function isFreeIntake(value: unknown): value is FreeIntake {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.siteName === 'string' &&
    typeof value.businessDescription === 'string' &&
    typeof value.audience === 'string' &&
    typeof value.style === 'string' &&
    typeof value.primaryAction === 'string' &&
    isRecord(value.metadata)
  );
}

function isFreeContactMethod(value: unknown): value is FreeContactMethod {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.platform === 'string' &&
    typeof value.value === 'string' &&
    (typeof value.label === 'string' || value.label === null) &&
    typeof value.publicVisible === 'boolean'
  );
}

function isFileAsset(value: unknown): value is FileAsset {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.key === 'string' &&
    typeof value.contentType === 'string' &&
    typeof value.sizeBytes === 'number' &&
    (typeof value.checksum === 'string' || value.checksum === null)
  );
}

function isFreeIntakeAsset(value: unknown): value is FreeIntakeAsset {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.intakeId === 'string' &&
    typeof value.fileAssetId === 'string' &&
    typeof value.safetyStatus === 'string'
  );
}

function isGeneratedFreeAsset(value: unknown): value is GeneratedFreeAsset {
  return (
    isRecord(value) &&
    isFreeIntakeAsset(value.asset) &&
    isFileAsset(value.fileAsset) &&
    typeof value.mediaPath === 'string'
  );
}

function isClaimedAsset(value: unknown): value is ClaimedAsset {
  return (
    isRecord(value) &&
    isFreeIntakeAsset(value.asset) &&
    isFileAsset(value.fileAsset) &&
    (value.sanitized === null || isGeneratedFreeAsset(value.sanitized)) &&
    typeof value.sourcePath === 'string'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido en runner Free.';
}

function logInfo(event: string, metadata: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', event, ...metadata }));
}

function logError(
  event: string,
  error: unknown,
  metadata: Record<string, unknown>,
): void {
  console.error(JSON.stringify({
    level: 'error',
    event,
    message: errorMessage(error),
    ...metadata,
  }));
}
