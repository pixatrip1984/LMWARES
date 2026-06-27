import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  defaultProjectConfig,
  extFromContentType,
  publicationImageKey,
} from '@starter/config';
import {
  addPublicationImageSchema,
  createPublicationSchema,
  paginationQuerySchema,
  parseInput,
  updatePublicationSchema,
  updatePublicationStatusSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';
import { mediaUrl } from '../lib/media';

export const publications = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** GET /admin/publications — todas las publicaciones (cualquier estado). */
publications.get('/', async (c) => {
  const { page, pageSize } = parseInput(paginationQuerySchema, c.req.query());
  const repos = createRepositories(c.env.DB);
  return c.json(await repos.publications.listAll({ page, pageSize }));
});

/** GET /admin/publications/:id — detalle con imágenes (cualquier estado). */
publications.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);
  const pub = await repos.publications.getById(id);
  if (!pub) throw AppError.notFound('Publicación');
  const images = await repos.publications.listImages(pub.id);
  return c.json({
    ...pub,
    images: images.map((img) => ({
      id: img.id,
      url: mediaUrl(c.env, img.key),
      alt: img.alt,
      position: img.position,
    })),
  });
});

/** POST /admin/publications — crear. */
publications.post('/', requireWrite, async (c) => {
  const input = parseInput(createPublicationSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);

  if (await repos.publications.getBySlug(input.slug)) {
    throw new AppError('conflict', `Ya existe una publicación con slug "${input.slug}".`);
  }

  const created = await repos.publications.create({
    slug: input.slug,
    title: input.title,
    summary: input.summary ?? null,
    body: input.body ?? null,
    status: input.status,
    coverImageId: input.coverImageId ?? null,
    metadata: input.metadata,
    sortOrder: input.sortOrder,
  });

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'publication.create',
    entityType: 'publication',
    entityId: created.id,
  });
  return c.json(created, 201);
});

/** PATCH /admin/publications/:id — editar. */
publications.patch('/:id', requireWrite, async (c) => {
  const id = c.req.param('id')!;
  const patch = parseInput(updatePublicationSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);

  const updated = await repos.publications.update(id, {
    ...patch,
    summary: patch.summary ?? undefined,
    body: patch.body ?? undefined,
    coverImageId: patch.coverImageId ?? undefined,
  });
  if (!updated) throw AppError.notFound('Publicación');

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'publication.update',
    entityType: 'publication',
    entityId: id,
  });
  return c.json(updated);
});

/** PATCH /admin/publications/:id/status — cambiar estado + historial. */
publications.patch('/:id/status', requireWrite, async (c) => {
  const id = c.req.param('id')!;
  const { status, reason } = parseInput(updatePublicationStatusSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);

  const existing = await repos.publications.getById(id);
  if (!existing) throw AppError.notFound('Publicación');

  const updated = await repos.publications.setStatus(id, status);
  await repos.statusHistory.record({
    entityType: 'publication',
    entityId: id,
    fromStatus: existing.status,
    toStatus: status,
    changedBy: c.get('admin').email,
    reason: reason ?? null,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'publication.status',
    entityType: 'publication',
    entityId: id,
    metadata: { from: existing.status, to: status },
  });
  return c.json(updated);
});

/** POST /admin/publications/:id/images — subir imagen (multipart) a R2. */
publications.post('/:id/images', requireWrite, async (c) => {
  const id = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);

  const pub = await repos.publications.getById(id);
  if (!pub) throw AppError.notFound('Publicación');

  // Hono parseBody tipa los campos de archivo como File (multipart).
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file === 'string' || Array.isArray(file)) {
    throw new AppError('validation_error', 'Falta el archivo "file".');
  }

  const limits = defaultProjectConfig.uploads;
  if (!limits.allowedImageTypes.includes(file.type)) {
    throw new AppError('validation_error', `Tipo de imagen no permitido: ${file.type}.`);
  }
  if (file.size > limits.maxImageBytes) {
    throw new AppError('validation_error', 'La imagen excede el tamaño máximo permitido.');
  }

  const meta = parseInput(addPublicationImageSchema, {
    alt: typeof body['alt'] === 'string' ? body['alt'] : undefined,
    position: typeof body['position'] === 'string' ? body['position'] : undefined,
  });

  const fileId = crypto.randomUUID();
  const key = publicationImageKey(pub.id, fileId, extFromContentType(file.type));
  const bytes = await file.arrayBuffer();
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type } });

  const asset = await repos.fileAssets.create({
    key,
    bucket: c.env.MEDIA_BUCKET_NAME,
    contentType: file.type,
    sizeBytes: bytes.byteLength,
    originalName: file.name,
    createdBy: c.get('admin').email,
  });
  const image = await repos.publications.addImage({
    publicationId: pub.id,
    fileAssetId: asset.id,
    alt: meta.alt ?? null,
    position: meta.position,
  });

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'publication.image.add',
    entityType: 'publication',
    entityId: pub.id,
    metadata: { imageId: image.id, key },
  });
  return c.json({ ...image, key, url: undefined }, 201);
});

/** DELETE /admin/publications/:id/images/:imageId — borrar imagen de R2 + D1. */
publications.delete('/:id/images/:imageId', requireWrite, async (c) => {
  const id = c.req.param('id')!;
  const imageId = c.req.param('imageId')!;
  const repos = createRepositories(c.env.DB);

  const image = await repos.publications.getImage(id, imageId);
  if (!image) throw AppError.notFound('Imagen');

  const asset = await repos.fileAssets.getById(image.fileAssetId);
  await repos.publications.removeImage(id, imageId);
  if (asset) {
    await c.env.MEDIA.delete(asset.key);
    await repos.fileAssets.delete(asset.id);
  }

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'publication.image.delete',
    entityType: 'publication',
    entityId: id,
    metadata: { imageId },
  });
  return c.body(null, 204);
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}
