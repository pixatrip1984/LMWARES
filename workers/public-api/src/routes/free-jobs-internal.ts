import { Hono } from 'hono';
import { freeSiteArtifactKey } from '@starter/config';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';

export const freeJobsInternal = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
    assets: assets.map(({ asset, fileAsset }) => ({
      asset,
      fileAsset,
      mediaPath: `/media/${encodePath(fileAsset.key)}`,
    })),
  });
});

freeJobsInternal.post('/free-jobs/:jobId/complete', async (c) => {
  const jobId = c.req.param('jobId')!;
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId', 'local-free-runner').slice(0, 120);
  const indexHtml = readString(body, 'indexHtml');
  const manifest = readRecord(body, 'manifest');

  if (indexHtml.length < 100) throw new AppError('validation_error', 'HTML generado demasiado corto.');
  if (indexHtml.length > 900_000) throw new AppError('validation_error', 'HTML generado demasiado grande.');

  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresFreeIntakes.getGenerationJobById(jobId);
  if (!job) throw AppError.notFound('Job Free');

  const intake = await repos.lmwaresFreeIntakes.getById(job.intakeId);
  if (!intake) throw AppError.notFound('Solicitud Free');

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

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
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
