import { Hono } from 'hono';
import { freeIntakeSanitizedImageKey, freeSiteArtifactKey } from '@starter/config';
import {
  AppError,
  type FileAsset,
  type FreeGenerationJob,
  type FreeIntakeAsset,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import { assertFreeImageDimensions, inspectFreeImage } from '../lib/free-image';
import { buildFreePublishedEmail } from '../lib/free-notification-email';
import { buildStarterPublishedEmail } from '../lib/starter-notification-email';

export const freeJobsInternal = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const MAX_SANITIZED_IMAGE_BYTES = 5 * 1024 * 1024;

freeJobsInternal.use('*', async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!(await safeTokenEqual(token, c.env.FREE_RUNNER_TOKEN))) {
    throw AppError.forbidden('Runner Free no autorizado.');
  }
  await next();
});

freeJobsInternal.post('/free-jobs/claim', async (c) => {
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId', 'local-free-runner').slice(0, 120);
  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresFreeIntakes.claimNextGenerationJob(runnerId);
  if (!job) return c.json({ job: null });

  const intake = await repos.lmwaresFreeIntakes.getById(job.intakeId);
  if (!intake) throw AppError.notFound('Solicitud Free');

  const [contacts, assets] = await Promise.all([
    repos.lmwaresFreeIntakes.listContacts(intake.id),
    repos.lmwaresFreeIntakes.listAssetsWithFiles(intake.id),
  ]);

  await repos.audit.record({
    actorType: 'system',
    actorId: runnerId,
    action: 'lmwares.free_job.claim',
    entityType: 'lmwares_free_job',
    entityId: job.id,
    metadata: { intakeId: intake.id, slug: intake.slug },
  });

  return c.json({
    job,
    intake,
    contacts,
    assets: assets.map(({ asset, fileAsset, sanitizedFileAsset }) => ({
      asset,
      fileAsset,
      sanitized: sanitizedFileAsset
        ? toSanitizedAssetResponse({ asset }, sanitizedFileAsset)
        : null,
      sourcePath: `/internal/free-jobs/${encodeURIComponent(job.id)}/assets/${encodeURIComponent(asset.id)}/source`,
    })),
  });
});

freeJobsInternal.get('/free-jobs/:jobId/assets/:assetId/source', async (c) => {
  const jobId = c.req.param('jobId')!;
  const assetId = c.req.param('assetId')!;
  const runnerId = readRunnerIdHeader(c.req.header('X-LMWares-Runner-Id'));
  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresFreeIntakes.getGenerationJobById(jobId);
  if (!job) throw AppError.notFound('Job Free');
  assertRunnerOwnsJob(job, runnerId);

  const entry = (await repos.lmwaresFreeIntakes.listAssetsWithFiles(job.intakeId)).find(
    ({ asset }) => asset.id === assetId,
  );
  if (!entry) throw AppError.notFound('Imagen Free');

  const object = await c.env.MEDIA.get(entry.fileAsset.key);
  if (!object) throw AppError.notFound('Original Free');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-lmwares-source-checksum', entry.fileAsset.checksum ?? '');
  return new Response(object.body, { headers });
});

freeJobsInternal.put('/free-jobs/:jobId/assets/:assetId/sanitized', async (c) => {
  const jobId = c.req.param('jobId')!;
  const assetId = c.req.param('assetId')!;
  const runnerId = readRunnerIdHeader(c.req.header('X-LMWares-Runner-Id'));
  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresFreeIntakes.getGenerationJobById(jobId);
  if (!job) throw AppError.notFound('Job Free');
  assertRunnerOwnsJob(job, runnerId);

  const existingEntry = (await repos.lmwaresFreeIntakes.listAssetsWithFiles(job.intakeId)).find(
    ({ asset }) => asset.id === assetId,
  );
  if (!existingEntry) throw AppError.notFound('Imagen Free');
  if (existingEntry.sanitizedFileAsset) {
    return c.json(toSanitizedAssetResponse(existingEntry, existingEntry.sanitizedFileAsset));
  }

  const declaredLength = Number(c.req.header('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SANITIZED_IMAGE_BYTES) {
    throw new AppError('validation_error', 'El derivado saneado supera el máximo permitido.');
  }
  const buffer = await c.req.arrayBuffer();
  if (buffer.byteLength <= 0 || buffer.byteLength > MAX_SANITIZED_IMAGE_BYTES) {
    throw new AppError('validation_error', 'El derivado saneado tiene un tamaño inválido.');
  }

  const inspected = inspectFreeImage(new Uint8Array(buffer));
  if (!inspected || inspected.contentType !== 'image/webp') {
    throw new AppError('validation_error', 'El runner debe entregar un WebP válido.');
  }
  assertFreeImageDimensions(inspected.width, inspected.height);

  const checksum = await sha256Hex(buffer);
  const fileId = crypto.randomUUID();
  const key = freeIntakeSanitizedImageKey(job.intakeId, fileId, inspected.extension);
  await c.env.MEDIA.put(key, buffer, {
    httpMetadata: { contentType: inspected.contentType },
    customMetadata: {
      intakeId: job.intakeId,
      assetId,
      jobId,
      checksum,
      sanitized: 'true',
    },
  });

  let fileAssetId: string | null = null;
  try {
    const fileAsset = await repos.fileAssets.create({
      key,
      bucket: 'MEDIA',
      contentType: inspected.contentType,
      sizeBytes: buffer.byteLength,
      originalName: null,
      checksum,
      createdBy: `runner:${runnerId}`,
    });
    fileAssetId = fileAsset.id;
    const asset = await repos.lmwaresFreeIntakes.markAssetSanitized({
      assetId,
      sanitizedFileAssetId: fileAsset.id,
      checksum,
      width: inspected.width,
      height: inspected.height,
    });
    if (!asset) throw AppError.notFound('Imagen Free');

    await repos.audit.record({
      actorType: 'system',
      actorId: runnerId,
      action: 'lmwares.free_asset.sanitize',
      entityType: 'lmwares_free_asset',
      entityId: assetId,
      metadata: {
        jobId,
        sourceFileAssetId: existingEntry.fileAsset.id,
        sanitizedFileAssetId: fileAsset.id,
        width: inspected.width,
        height: inspected.height,
        checksum,
      },
    });

    return c.json(
      toSanitizedAssetResponse({ asset }, fileAsset),
      201,
    );
  } catch (error) {
    await c.env.MEDIA.delete(key);
    if (fileAssetId) await repos.fileAssets.delete(fileAssetId);
    throw error;
  }
});

freeJobsInternal.post('/free-jobs/:jobId/complete', async (c) => {
  const jobId = c.req.param('jobId')!;
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId', 'local-free-runner').slice(0, 120);
  const indexHtml = readString(body, 'indexHtml');
  const manifest = readRecord(body, 'manifest');

  if (indexHtml.length < 100) throw new AppError('validation_error', 'HTML generado demasiado corto.');
  if (indexHtml.length > 900_000) throw new AppError('validation_error', 'HTML generado demasiado grande.');
  if (/free-intakes\/[^/"']+\/original\//i.test(indexHtml)) {
    throw new AppError('validation_error', 'El HTML intenta publicar una imagen original en cuarentena.');
  }

  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresFreeIntakes.getGenerationJobById(jobId);
  if (!job) throw AppError.notFound('Job Free');
  assertRunnerOwnsJob(job, runnerId);

  const intake = await repos.lmwaresFreeIntakes.getById(job.intakeId);
  if (!intake) throw AppError.notFound('Solicitud Free');
  const assets = await repos.lmwaresFreeIntakes.listAssetsWithFiles(intake.id);
  if (
    assets.length < 1 ||
    assets.some(
      ({ asset, sanitizedFileAsset }) =>
        asset.safetyStatus !== 'sanitized' || !sanitizedFileAsset,
    )
  ) {
    throw new AppError(
      'conflict',
      'Todas las imágenes deben estar saneadas antes de publicar el sitio.',
    );
  }

  const artifactVersion = Date.now();
  const indexKey = freeSiteArtifactKey(intake.slug, artifactVersion, 'index.html');
  const manifestKey = freeSiteArtifactKey(intake.slug, artifactVersion, 'manifest.json');
  const publicUrl = `https://${intake.slug}.${c.env.FREE_SITE_BASE_DOMAIN}`;

  await c.env.MEDIA.put(indexKey, indexHtml, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: { intakeId: intake.id, jobId, slug: intake.slug },
  });
  await c.env.MEDIA.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { intakeId: intake.id, jobId, slug: intake.slug },
  });

  const published = await repos.lmwaresFreeIntakes.publishFreeSite({
    jobId,
    indexKey,
    manifestKey,
    publicUrl,
  });
  if (!published) throw AppError.notFound('Solicitud Free');

  await repos.audit.record({
    actorType: 'system',
    actorId: runnerId,
    action: 'lmwares.free_job.complete',
    entityType: 'lmwares_free_job',
    entityId: jobId,
    metadata: { intakeId: intake.id, slug: intake.slug, indexKey, manifestKey },
  });

  return c.json({
    intake: published,
    publicUrl,
    localPreviewUrl: `/sites/${encodeURIComponent(intake.slug)}`,
    indexKey,
    manifestKey,
  });
});

freeJobsInternal.post('/free-jobs/:jobId/fail', async (c) => {
  const jobId = c.req.param('jobId')!;
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId', 'local-free-runner').slice(0, 120);
  const code = readString(body, 'code', 'runner_failed').slice(0, 80);
  const message = readString(body, 'message', 'El runner Free no pudo generar el sitio.').slice(0, 500);

  const repos = createRepositories(c.env.DB);
  const existingJob = await repos.lmwaresFreeIntakes.getGenerationJobById(jobId);
  if (!existingJob) throw AppError.notFound('Job Free');
  assertRunnerOwnsJob(existingJob, runnerId);
  const job = await repos.lmwaresFreeIntakes.failGenerationJob(jobId, code, message);
  if (!job) throw AppError.notFound('Job Free');

  await repos.audit.record({
    actorType: 'system',
    actorId: runnerId,
    action: 'lmwares.free_job.fail',
    entityType: 'lmwares_free_job',
    entityId: jobId,
    metadata: { code, message },
  });

  return c.json({ job });
});

freeJobsInternal.post('/free-notifications/dispatch', async (c) => {
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId', 'local-free-runner').slice(0, 120);
  const repos = createRepositories(c.env.DB);
  const notification = await repos.lmwaresNotifications.claimNext(runnerId);
  if (!notification) return c.json({ notification: null });

  try {
    const email = notification.template === 'starter-site-published'
      ? buildStarterPublishedEmail({
          siteName: readMetadataString(notification.payload, 'siteName'),
          publicUrl: readMetadataString(notification.payload, 'publicUrl'),
          workOrderId: readMetadataString(notification.payload, 'workOrderId'),
          intakeId: readMetadataString(notification.payload, 'intakeId'),
          projectId: readMetadataString(notification.payload, 'projectId'),
          billingOrderId: readMetadataString(notification.payload, 'billingOrderId'),
          commercialOfferId: readMetadataString(notification.payload, 'commercialOfferId'),
          maintenanceSubscriptionId: readOptionalMetadataString(
            notification.payload,
            'maintenanceSubscriptionId',
          ),
          monthlyAmountCents: readMetadataNumber(notification.payload, 'monthlyAmountCents'),
          notificationId: notification.id,
          recipientEmail: notification.toAddress,
          publishedAt:
            readOptionalMetadataString(notification.payload, 'publishedAt')
            ?? notification.createdAt,
          supportEmail: c.env.EMAIL_REPLY_TO,
          accountUrl: `${c.env.PUBLIC_WEB_URL.replace(/\/+$/, '')}/configurar`,
        })
      : notification.template === 'free-site-published'
        ? buildFreePublishedEmail({
          siteName: readMetadataString(notification.payload, 'siteName'),
          publicUrl: readMetadataString(notification.payload, 'publicUrl'),
          referenceId: notification.intakeId ?? readMetadataString(notification.payload, 'intakeId'),
          notificationId: notification.id,
          recipientEmail: notification.toAddress,
          publishedAt:
            readOptionalMetadataString(notification.payload, 'publishedAt')
            ?? notification.createdAt,
          supportEmail: c.env.EMAIL_REPLY_TO,
        })
        : unsupportedNotificationTemplate(notification.template);
    const result = await c.env.EMAIL.send({
      to: notification.toAddress,
      from: { email: c.env.EMAIL_FROM, name: 'LMWares' },
      replyTo: c.env.EMAIL_REPLY_TO,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    const sent = await repos.lmwaresNotifications.markSent(
      notification.id,
      runnerId,
      result.messageId,
    );
    if (!sent) throw new AppError('conflict', 'La notificación perdió su lease antes de confirmarse.');

    await repos.audit.record({
      actorType: 'system',
      actorId: runnerId,
      action: notification.template === 'starter-site-published'
        ? 'lmwares.starter_site_published.email_sent'
        : 'lmwares.free_notification.sent',
      entityType: notification.template === 'starter-site-published'
        ? 'lmwares_starter_work_order'
        : 'lmwares_free_intake',
      entityId: notification.template === 'starter-site-published'
        ? readOptionalMetadataString(notification.payload, 'workOrderId')
        : notification.intakeId,
      metadata: {
        notificationId: notification.id,
        providerMessageId: result.messageId,
        template: notification.template,
      },
    });
    return c.json({ notification: sent });
  } catch (error) {
    const code = emailErrorCode(error);
    const message = error instanceof Error ? error.message : 'No fue posible enviar la notificación.';
    const retryAt = isPermanentEmailError(code) || notification.attempt >= notification.maxAttempts
      ? null
      : new Date(Date.now() + retryDelayMs(notification.attempt)).toISOString();
    const failed = await repos.lmwaresNotifications.markFailed({
      id: notification.id,
      claimedBy: runnerId,
      code,
      message,
      retryAt,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: runnerId,
      action: notification.template === 'starter-site-published'
        ? 'lmwares.starter_site_published.email_failed'
        : 'lmwares.free_notification.failed',
      entityType: notification.template === 'starter-site-published'
        ? 'lmwares_starter_work_order'
        : 'lmwares_free_intake',
      entityId: notification.template === 'starter-site-published'
        ? readOptionalMetadataString(notification.payload, 'workOrderId')
        : notification.intakeId,
      metadata: { notificationId: notification.id, code, retryAt },
    });
    return c.json({ notification: failed, retryScheduled: Boolean(retryAt) });
  }
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}

function readString(body: unknown, key: string, fallback = '') {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

function readRecord(body: unknown, key: string) {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const value = record[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('validation_error', `${key} debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

function readMetadataString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('validation_error', `La notificación no contiene ${key}.`);
  }
  return value.trim();
}

function readOptionalMetadataString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readMetadataNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new AppError('validation_error', `La notificación no contiene ${key}.`);
  }
  return value;
}

function unsupportedNotificationTemplate(template: string): never {
  throw new AppError('validation_error', `Plantilla de email no soportada: ${template.slice(0, 80)}.`);
}

function emailErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return error instanceof AppError ? error.code : 'email_delivery_failed';
}

function isPermanentEmailError(code: string): boolean {
  return new Set([
    'validation_error',
    'E_VALIDATION_ERROR',
    'E_FIELD_MISSING',
    'E_SENDER_NOT_VERIFIED',
    'E_RECIPIENT_NOT_ALLOWED',
    'E_RECIPIENT_SUPPRESSED',
    'E_SENDER_DOMAIN_NOT_AVAILABLE',
    'E_CONTENT_TOO_LARGE',
    'E_HEADER_NOT_ALLOWED',
    'E_HEADER_USE_API_FIELD',
    'E_HEADER_VALUE_INVALID',
  ]).has(code);
}

function retryDelayMs(attempt: number): number {
  return Math.min(60 * 60 * 1000, 60_000 * 5 ** Math.max(0, attempt - 1));
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function readRunnerIdHeader(value: string | undefined) {
  const runnerId = value?.trim().slice(0, 120) ?? '';
  if (!runnerId) throw AppError.forbidden('Falta la identidad del runner Free.');
  return runnerId;
}

function assertRunnerOwnsJob(job: FreeGenerationJob, runnerId: string) {
  if (job.status !== 'claimed' || job.claimedBy !== runnerId) {
    throw AppError.forbidden('El job Free no pertenece a este runner o ya no está activo.');
  }
}

function toSanitizedAssetResponse(
  entry: { asset: FreeIntakeAsset },
  fileAsset: FileAsset,
) {
  return {
    asset: entry.asset,
    fileAsset,
    mediaPath: `/media/${encodePath(fileAsset.key)}`,
  };
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function safeTokenEqual(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < left.length && index < right.length; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }
  return diff === 0;
}
