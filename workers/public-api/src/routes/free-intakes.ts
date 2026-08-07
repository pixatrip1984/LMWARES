import { Hono } from 'hono';
import { freeIntakeOriginalImageKey } from '@starter/config';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  FREE_INTAKE_IMAGE_LIMIT,
  FREE_INTAKE_IMAGE_MAX_BYTES,
  checkFreeSlugSchema,
  createFreeIntakeSchema,
  parseInput,
  submitFreeIntakeSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { assertFreeImageDimensions, inspectFreeImage } from '../lib/free-image';
import { verifyTurnstile } from '../lib/turnstile';
import {
  assertIntakeOwner,
  assertTrustedPublicOrigin,
  requirePublicSession,
} from '../middleware/public-auth';

export const freeIntakes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Nota (2026-08-07): tras mover los sitios de clientes a un namespace
// dedicado (`{slug}.sitios.lmwares.com`, ver FREE_SITE_BASE_DOMAIN), esta
// lista ya NO es la única defensa contra colisiones técnicas con nuestras
// propias herramientas — ambas viven en árboles DNS distintos. Se conserva
// por dos razones: (1) protección de marca/confusión (evitar que un cliente
// use un slug idéntico al de una herramienta interna, aunque no choque
// técnicamente), y (2) defensa en profundidad mientras se completa la
// migración del DNS wildcard nuevo.
const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'astramuses',
  'blog',
  'cdn',
  'contratar',
  'help',
  'login',
  'mail',
  'media',
  'oracle',
  'sitios',
  'soporte',
  'status',
  'www',
]);

freeIntakes.get('/slugs/:slug', async (c) => {
  const slug = normalizeSlug(c.req.param('slug'));
  const parsed = parseInput(checkFreeSlugSchema, { slug });
  const available = await isSlugAvailable(c.env.DB, parsed.slug);
  return c.json({
    slug: parsed.slug,
    available,
    suggestions: available ? [] : slugSuggestions(parsed.slug),
  });
});

freeIntakes.post('/', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const raw = await readJson(c);
  const input = parseInput(createFreeIntakeSchema, {
    ...(raw as Record<string, unknown>),
    slug: normalizeSlug((raw as { slug?: unknown }).slug),
  });

  await verifyPublicTurnstile(c, input.turnstileToken);

  const repos = createRepositories(c.env.DB);
  const available = await isSlugAvailable(c.env.DB, input.slug);
  if (!available) throw new AppError('conflict', 'Ese subdominio ya no está disponible.');

  const intake = await repos.lmwaresFreeIntakes.create({
    userId: session.user.id,
    slug: input.slug,
    siteName: input.siteName,
    contactName: input.contactName,
    contactEmail: session.user.email,
    businessDescription: input.businessDescription,
    audience: input.audience,
    sector: input.sector ?? null,
    style: input.style,
    primaryAction: input.primaryAction,
    contacts: input.contacts,
    metadata: {
      schema: 'lmwares.free-intake.v1',
      source: 'public-package-builder',
      freePage: input.freePage ?? null,
    },
  });

  await repos.audit.record({
    actorType: 'public',
    actorId: session.user.id,
    action: 'lmwares.free_intake.create',
    entityType: 'lmwares_free_intake',
    entityId: intake.id,
    metadata: { slug: intake.slug },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });

  return c.json({ id: intake.id, slug: intake.slug, status: intake.status }, 201);
});

freeIntakes.post('/:id/images', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const intakeId = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);
  const intake = await repos.lmwaresFreeIntakes.getById(intakeId);
  if (!intake) throw AppError.notFound('Solicitud Free');
  assertIntakeOwner(intake, session.user.id);
  if (intake.status !== 'draft') {
    throw new AppError('conflict', 'Esta solicitud ya fue enviada y no acepta más imágenes.');
  }

  const currentAssets = await repos.lmwaresFreeIntakes.countAssets(intakeId);
  if (currentAssets >= FREE_INTAKE_IMAGE_LIMIT) {
    throw new AppError('validation_error', `El plan Free permite máximo ${FREE_INTAKE_IMAGE_LIMIT} imágenes.`);
  }

  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await c.req.parseBody();
  } catch {
    throw new AppError('validation_error', 'La carga multipart de la imagen es inválida.');
  }
  const file = firstFile(body.image);
  if (!file) throw new AppError('validation_error', 'Debes adjuntar una imagen.');
  if (file.size <= 0) throw new AppError('validation_error', 'La imagen está vacía.');
  if (file.size > FREE_INTAKE_IMAGE_MAX_BYTES) {
    throw new AppError('validation_error', 'La imagen supera el máximo de 5 MB.');
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > FREE_INTAKE_IMAGE_MAX_BYTES) {
    throw new AppError('validation_error', 'La imagen supera el máximo de 5 MB.');
  }

  const inspected = inspectFreeImage(new Uint8Array(bytes));
  if (!inspected) {
    throw new AppError('validation_error', 'Formato no permitido. Usa JPG, PNG o WebP.');
  }
  assertFreeImageDimensions(inspected.width, inspected.height);

  const checksum = await sha256Hex(bytes);
  const fileId = crypto.randomUUID();
  const key = freeIntakeOriginalImageKey(intakeId, fileId, inspected.extension);

  await c.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: inspected.contentType },
    customMetadata: {
      intakeId,
      originalName: safeFileName(file.name),
      checksum,
      quarantine: 'true',
    },
  });

  let asset;
  let fileAsset;
  try {
    fileAsset = await repos.fileAssets.create({
      key,
      bucket: 'MEDIA',
      contentType: inspected.contentType,
      sizeBytes: bytes.byteLength,
      originalName: safeFileName(file.name),
      checksum,
      createdBy: `public:${intakeId}`,
    });
    asset = await repos.lmwaresFreeIntakes.addAsset({
      intakeId,
      fileAssetId: fileAsset.id,
      checksum,
      position: currentAssets,
      role: 'source',
      safetyStatus: 'quarantined',
    });
  } catch (error) {
    await c.env.MEDIA.delete(key);
    throw error;
  }

  await repos.audit.record({
    actorType: 'public',
    actorId: session.user.id,
    action: 'lmwares.free_intake.image_upload',
    entityType: 'lmwares_free_intake',
    entityId: intakeId,
    metadata: {
      assetId: asset.id,
      fileAssetId: fileAsset.id,
      contentType: inspected.contentType,
      width: inspected.width,
      height: inspected.height,
    },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });

  return c.json({
    id: asset.id,
    fileAssetId: fileAsset.id,
    status: asset.safetyStatus,
    checksum,
  }, 201);
});

freeIntakes.post('/:id/submit', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const intakeId = c.req.param('id')!;
  const raw = await readJson(c);
  parseInput(submitFreeIntakeSchema, raw);

  const repos = createRepositories(c.env.DB);
  const intake = await repos.lmwaresFreeIntakes.getById(intakeId);
  if (!intake) throw AppError.notFound('Solicitud Free');
  assertIntakeOwner(intake, session.user.id);

  const assetCount = await repos.lmwaresFreeIntakes.countAssets(intakeId);
  if (assetCount < 1) throw new AppError('validation_error', 'Debes subir al menos una imagen.');

  let requestId = intake.requestId;
  if (!requestId) {
    const request = await repos.requests.create({
      type: 'lmwares-free',
      contactName: intake.contactName,
      contactEmail: intake.contactEmail,
      contactPhone: null,
      message: intake.businessDescription,
      payload: {
        intakeId: intake.id,
        slug: intake.slug,
        siteName: intake.siteName,
        audience: intake.audience,
        style: intake.style,
        assetCount,
      },
      source: 'public-package-builder',
    });
    requestId = request.id;
  }

  const submitted = await repos.lmwaresFreeIntakes.submit(intakeId, requestId);
  if (!submitted) throw AppError.notFound('Solicitud Free');

  await repos.audit.record({
    actorType: 'public',
    actorId: session.user.id,
    action: 'lmwares.free_intake.submit',
    entityType: 'lmwares_free_intake',
    entityId: intakeId,
    metadata: { slug: submitted.slug, requestId, assetCount },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });

  const job = await repos.lmwaresFreeIntakes.getLatestGenerationJob(intakeId);
  if (!job) throw new AppError('internal_error', 'No fue posible preparar el trabajo Free.');
  await c.env.FREE_JOBS_QUEUE.send({
    kind: 'free-intake-submitted',
    intakeId: submitted.id,
    jobId: job.id,
  });

  return c.json({
    id: submitted.id,
    slug: submitted.slug,
    status: submitted.status,
    jobStatus: job.status,
    publicUrl: submitted.publishedUrl,
  });
});

freeIntakes.get('/:id/status', async (c) => {
  const session = await requirePublicSession(c);
  const intakeId = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);
  const intake = await repos.lmwaresFreeIntakes.getById(intakeId);
  if (!intake) throw AppError.notFound('Solicitud Free');
  assertIntakeOwner(intake, session.user.id);

  const [contacts, assets, job] = await Promise.all([
    repos.lmwaresFreeIntakes.listContacts(intakeId),
    repos.lmwaresFreeIntakes.listAssets(intakeId),
    repos.lmwaresFreeIntakes.getLatestGenerationJob(intakeId),
  ]);

  return c.json({
    intake,
    contacts,
    assets,
    job,
    publicUrl: intake.publishedUrl,
    assetCount: assets.length,
  });
});

async function isSlugAvailable(db: Bindings['DB'], slug: string) {
  if (RESERVED_SLUGS.has(slug)) return false;
  const repos = createRepositories(db);
  return repos.lmwaresFreeIntakes.isSlugAvailable(slug);
}

function normalizeSlug(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugSuggestions(slug: string) {
  const suffixes = ['mx', 'online', 'web'];
  return suffixes.map((suffix) => `${slug}-${suffix}`).filter((candidate) => !RESERVED_SLUGS.has(candidate));
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}

async function verifyPublicTurnstile(
  c: { env: Bindings; req: { header: (name: string) => string | undefined } },
  token?: string,
) {
  if (c.env.TURNSTILE_DISABLED === '1') return;
  if (!token) throw new AppError('turnstile_failed', 'Falta la verificación anti-spam.');
  const ok = await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, token, c.req.header('CF-Connecting-IP'));
  if (!ok) throw new AppError('turnstile_failed', 'Verificación anti-spam fallida.');
}

function firstFile(value: unknown): File | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate instanceof File ? candidate : null;
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 160) || 'image';
}
