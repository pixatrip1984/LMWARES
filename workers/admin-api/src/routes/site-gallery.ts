import { Hono } from 'hono';
import type { Context } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import { parseInput } from '@starter/validation';
import {
  SiteGalleryRepository,
  type SiteGalleryAlbumDetailRecord,
  type SiteGalleryAlbumSummaryRecord,
  type SiteGalleryStoredImage,
} from '@starter/db';
import {
  SITE_GALLERY_ALLOWED_IMAGE_MIME_TYPES,
  SITE_GALLERY_MAX_IMAGE_BYTES,
  SITE_GALLERY_MAX_IMAGE_DIMENSION,
  SITE_GALLERY_MAX_IMAGE_PIXELS,
  SITE_GALLERY_MAX_IMAGES_PER_ALBUM,
  SITE_GALLERY_MIN_IMAGE_DIMENSION,
  createSiteGalleryAlbumSchema,
  reorderSiteGalleryImagesSchema,
  setSiteGalleryCoverSchema,
  siteGalleryAlbumIdSchema,
  siteGalleryImageIdSchema,
  siteGalleryProjectIdSchema,
  siteGalleryStatusReasonSchema,
  siteGalleryUploadFieldsSchema,
  updateSiteGalleryAlbumSchema,
  updateSiteGalleryImageSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { mediaUrl } from '../lib/media';
import { requireStarterClientRuntime } from '../lib/starter-project-authorization';
import { requireWrite } from '../middleware/auth';

type GalleryContext = Context<{
  Bindings: Bindings;
  Variables: Variables;
}>;

type AllowedImageMime =
  (typeof SITE_GALLERY_ALLOWED_IMAGE_MIME_TYPES)[number];

interface InspectedImage {
  contentType: AllowedImageMime;
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
}

/**
 * Montaje esperado:
 * app.route('/admin/projects/:projectId/modules/galleries', adminSiteGalleries)
 *
 * Todas las rutas son relativas para mantener esta vertical aislada.
 */
export const adminSiteGalleries = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminSiteGalleries.use('*', async (c, next) => {
  await requireStarterClientRuntime(c.env.DB, c.req.param('projectId')!);
  await next();
});

adminSiteGalleries.get('/', async (c) => {
  const projectId = readProjectId(c);
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const [albums, publishedAlbums] = await Promise.all([
    gallery.listAdmin(projectId),
    gallery.listPublished(projectId),
  ]);
  return c.json({
    projectId,
    albums: albums.map((album) => presentSummary(c, album)),
    publishedAlbums: publishedAlbums.map((album) => presentSummary(c, album)),
  });
});

adminSiteGalleries.post('/', requireWrite, async (c) => {
  const projectId = readProjectId(c);
  const input = parseInput(createSiteGalleryAlbumSchema, await readJson(c));
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  await assertSlugAvailable(gallery, projectId, input.slug);

  const album = await gallery.createAlbum(
    projectId,
    {
      slug: input.slug,
      title: input.title,
      description: input.description,
      category: input.category,
      sortOrder: input.sortOrder,
    },
    c.get('admin').email,
  );
  await audit(c, {
    action: 'site_gallery.album.create',
    projectId,
    albumId: album.id,
    metadata: { slug: album.slug, status: album.status },
  });
  return c.json(presentDetail(c, album), 201);
});

adminSiteGalleries.get('/:albumId', async (c) => {
  const projectId = readProjectId(c);
  const albumId = readAlbumId(c);
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const album = await gallery.getDetail(projectId, albumId);
  if (!album) throw AppError.notFound('Álbum');
  return c.json(presentDetail(c, album));
});

adminSiteGalleries.patch('/:albumId', requireWrite, async (c) => {
  const projectId = readProjectId(c);
  const albumId = readAlbumId(c);
  const patch = parseInput(updateSiteGalleryAlbumSchema, await readJson(c));
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  if (patch.slug) {
    await assertSlugAvailable(gallery, projectId, patch.slug, albumId);
  }

  const album = await gallery.updateAlbum(projectId, albumId, {
    ...patch,
    description:
      patch.description === undefined ? undefined : patch.description,
  });
  if (!album) throw AppError.notFound('Álbum');
  await audit(c, {
    action: 'site_gallery.album.update',
    projectId,
    albumId,
    metadata: { fields: Object.keys(patch) },
  });
  return c.json(presentDetail(c, album));
});

adminSiteGalleries.post('/:albumId/draft', requireWrite, async (c) => {
  const projectId = readProjectId(c);
  const albumId = readAlbumId(c);
  const { reason } = parseInput(
    siteGalleryStatusReasonSchema,
    await readJson(c),
  );
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const before = await gallery.getById(projectId, albumId);
  if (!before) throw AppError.notFound('Álbum');
  const album = await gallery.saveDraft(
    projectId,
    albumId,
    c.get('admin').email,
    reason ?? 'Guardado como borrador',
  );
  if (!album) throw AppError.notFound('Álbum');
  await audit(c, {
    action: 'site_gallery.album.draft',
    projectId,
    albumId,
    metadata: { from: before.status, to: album.status },
  });
  return c.json(presentDetail(c, album));
});

adminSiteGalleries.post('/:albumId/publish', requireWrite, async (c) => {
  const projectId = readProjectId(c);
  const albumId = readAlbumId(c);
  const { reason } = parseInput(
    siteGalleryStatusReasonSchema,
    await readJson(c),
  );
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const before = await gallery.getDetail(projectId, albumId);
  if (!before) throw AppError.notFound('Álbum');
  if (before.images.length === 0) {
    throw new AppError(
      'validation_error',
      'Agrega al menos una imagen antes de publicar el álbum.',
    );
  }

  const publication = await gallery.publishAlbum(
    projectId,
    albumId,
    c.get('admin').email,
    reason ?? 'Álbum publicado',
  );
  if (!publication) throw AppError.notFound('Álbum');
  const { album, orphanedImages } = publication;
  await deleteOrphanedObjects(c, orphanedImages);
  await audit(c, {
    action: 'site_gallery.album.publish',
    projectId,
    albumId,
    metadata: {
      from: before.status,
      to: album.status,
      imageCount: album.images.length,
      coverImageId: album.coverImageId,
    },
  });
  return c.json(presentDetail(c, album));
});

adminSiteGalleries.post('/:albumId/unpublish', requireWrite, async (c) => {
  const projectId = readProjectId(c);
  const albumId = readAlbumId(c);
  const { reason } = parseInput(
    siteGalleryStatusReasonSchema,
    await readJson(c),
  );
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const before = await gallery.getDetail(projectId, albumId);
  if (!before) throw AppError.notFound('Álbum');

  const album = await gallery.unpublishAlbum(
    projectId,
    albumId,
    c.get('admin').email,
    reason ?? 'Álbum retirado de la vista pública',
  );
  if (!album) throw AppError.notFound('Álbum');
  await audit(c, {
    action: 'site_gallery.album.unpublish',
    projectId,
    albumId,
    metadata: {
      from: before.status,
      to: album.status,
      imageCount: album.images.length,
    },
  });
  return c.json(presentDetail(c, album));
});

adminSiteGalleries.post('/:albumId/images', requireWrite, async (c) => {
  const projectId = readProjectId(c);
  const albumId = readAlbumId(c);
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const album = await gallery.getDetail(projectId, albumId);
  if (!album) throw AppError.notFound('Álbum');
  if (album.images.length >= SITE_GALLERY_MAX_IMAGES_PER_ALBUM) {
    throw new AppError(
      'validation_error',
      `El álbum admite hasta ${SITE_GALLERY_MAX_IMAGES_PER_ALBUM} imágenes.`,
    );
  }

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file === 'string' || Array.isArray(file)) {
    throw new AppError('validation_error', 'Falta el archivo "file".');
  }
  if (
    !SITE_GALLERY_ALLOWED_IMAGE_MIME_TYPES.some(
      (contentType) => contentType === file.type,
    )
  ) {
    throw new AppError(
      'validation_error',
      'Sólo se permiten imágenes JPG, PNG o WebP.',
    );
  }
  if (file.size < 1 || file.size > SITE_GALLERY_MAX_IMAGE_BYTES) {
    throw new AppError(
      'validation_error',
      `La imagen debe pesar entre 1 byte y ${formatMegabytes(
        SITE_GALLERY_MAX_IMAGE_BYTES,
      )}.`,
    );
  }

  const fields = parseInput(siteGalleryUploadFieldsSchema, {
    alt: typeof body['alt'] === 'string' ? body['alt'] : undefined,
  });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > SITE_GALLERY_MAX_IMAGE_BYTES
  ) {
    throw new AppError(
      'validation_error',
      'El tamaño real del archivo no está permitido.',
    );
  }

  const inspected = inspectImage(bytes, file.type as AllowedImageMime);
  assertReasonableDimensions(inspected.width, inspected.height);

  const checksumBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const checksum = `sha256:${toHex(new Uint8Array(checksumBuffer))}`;
  const key = galleryImageKey(
    projectId,
    albumId,
    inspected.extension,
  );

  await c.env.MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType: inspected.contentType,
      contentDisposition: 'inline',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      module: 'site-gallery',
      projectId,
      albumId,
    },
    sha256: checksumBuffer,
  });

  let image: SiteGalleryStoredImage | null = null;
  try {
    image = await gallery.addImage({
      projectId,
      albumId,
      key,
      bucket: c.env.MEDIA_BUCKET_NAME,
      contentType: inspected.contentType,
      sizeBytes: bytes.byteLength,
      originalName: safeOriginalName(file.name),
      checksum,
      createdBy: c.get('admin').email,
      alt: fields.alt ?? null,
      width: inspected.width,
      height: inspected.height,
    });
    if (!image) throw AppError.notFound('Álbum');
  } catch (error) {
    try {
      await c.env.MEDIA.delete(key);
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          message: 'site_gallery.upload.rollback_failed',
          key,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        }),
      );
    }
    throw error;
  }

  await audit(c, {
    action: 'site_gallery.image.add',
    projectId,
    albumId,
    metadata: {
      imageId: image.id,
      contentType: image.contentType,
      sizeBytes: image.sizeBytes,
      width: image.width,
      height: image.height,
    },
  });
  return c.json(presentImage(c, image), 201);
});

adminSiteGalleries.patch(
  '/:albumId/images/order',
  requireWrite,
  async (c) => {
    const projectId = readProjectId(c);
    const albumId = readAlbumId(c);
    const { imageIds } = parseInput(
      reorderSiteGalleryImagesSchema,
      await readJson(c),
    );
    const gallery = new SiteGalleryRepository(c.env.DB);
    await assertProject(gallery, projectId);
    const album = await gallery.reorderImages(projectId, albumId, imageIds);
    if (!album) {
      throw new AppError(
        'validation_error',
        'El orden debe incluir exactamente todas las imágenes actuales del álbum.',
      );
    }
    await audit(c, {
      action: 'site_gallery.images.reorder',
      projectId,
      albumId,
      metadata: { imageIds },
    });
    return c.json(presentDetail(c, album));
  },
);

adminSiteGalleries.patch('/:albumId/cover', requireWrite, async (c) => {
  const projectId = readProjectId(c);
  const albumId = readAlbumId(c);
  const { imageId } = parseInput(
    setSiteGalleryCoverSchema,
    await readJson(c),
  );
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const album = await gallery.setCover(projectId, albumId, imageId);
  if (!album) {
    throw new AppError(
      'validation_error',
      'La portada debe ser una imagen del mismo álbum.',
    );
  }
  await audit(c, {
    action: 'site_gallery.cover.set',
    projectId,
    albumId,
    metadata: { imageId },
  });
  return c.json(presentDetail(c, album));
});

adminSiteGalleries.patch(
  '/:albumId/images/:imageId',
  requireWrite,
  async (c) => {
    const projectId = readProjectId(c);
    const albumId = readAlbumId(c);
    const imageId = readImageId(c);
    const { alt } = parseInput(
      updateSiteGalleryImageSchema,
      await readJson(c),
    );
    const gallery = new SiteGalleryRepository(c.env.DB);
    await assertProject(gallery, projectId);
    const image = await gallery.updateImageAlt(
      projectId,
      albumId,
      imageId,
      alt,
    );
    if (!image) throw AppError.notFound('Imagen');
    await audit(c, {
      action: 'site_gallery.image.update',
      projectId,
      albumId,
      metadata: { imageId, field: 'alt' },
    });
    return c.json(presentImage(c, image));
  },
);

adminSiteGalleries.delete(
  '/:albumId/images/:imageId',
  requireWrite,
  async (c) => {
    const projectId = readProjectId(c);
    const albumId = readAlbumId(c);
    const imageId = readImageId(c);
    const gallery = new SiteGalleryRepository(c.env.DB);
    await assertProject(gallery, projectId);
    const image = await gallery.getImage(projectId, albumId, imageId);
    if (!image) throw AppError.notFound('Imagen');

    // Una imagen incluida en la revisión pública debe seguir existiendo en R2
    // aunque se quite del borrador. Se limpia al publicar la siguiente revisión.
    const retainedForPublication = await gallery.imageIsPublished(
      projectId,
      albumId,
      imageId,
    );
    if (!retainedForPublication) await c.env.MEDIA.delete(image.key);
    const removed = await gallery.removeImage(projectId, albumId, imageId);
    if (!removed) throw AppError.notFound('Imagen');

    await audit(c, {
      action: 'site_gallery.image.delete',
      projectId,
      albumId,
      metadata: { imageId, retainedForPublication },
    });
    return c.body(null, 204);
  },
);

function readProjectId(c: GalleryContext): string {
  return parseInput(siteGalleryProjectIdSchema, c.req.param('projectId'));
}

function readAlbumId(c: GalleryContext): string {
  return parseInput(siteGalleryAlbumIdSchema, c.req.param('albumId'));
}

function readImageId(c: GalleryContext): string {
  return parseInput(siteGalleryImageIdSchema, c.req.param('imageId'));
}

async function assertProject(
  gallery: SiteGalleryRepository,
  projectId: string,
): Promise<void> {
  if (!(await gallery.projectExists(projectId))) {
    throw AppError.notFound('Proyecto');
  }
}

async function assertSlugAvailable(
  gallery: SiteGalleryRepository,
  projectId: string,
  slug: string,
  exceptAlbumId?: string,
): Promise<void> {
  if (await gallery.slugExists(projectId, slug, exceptAlbumId)) {
    throw new AppError(
      'conflict',
      `Ya existe un álbum con el slug "${slug}" en este proyecto.`,
    );
  }
}

async function audit(
  c: GalleryContext,
  data: {
    action: string;
    projectId: string;
    albumId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await createRepositories(c.env.DB).audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: data.action,
    entityType: 'lmwares_project',
    entityId: data.projectId,
    metadata: { albumId: data.albumId, ...(data.metadata ?? {}) },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
}

function presentSummary(
  c: GalleryContext,
  album: SiteGalleryAlbumSummaryRecord,
) {
  return {
    id: album.id,
    projectId: album.projectId,
    slug: album.slug,
    title: album.title,
    description: album.description,
    category: album.category,
    status: album.status,
    coverImageId: album.coverImageId,
    sortOrder: album.sortOrder,
    publishedAt: album.publishedAt,
    publishedRevisionAt: album.publishedRevisionAt,
    hasUnpublishedChanges: album.hasUnpublishedChanges,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    imageCount: album.imageCount,
    coverImage: album.coverImage
      ? presentImage(c, album.coverImage)
      : null,
  };
}

function presentDetail(c: GalleryContext, album: SiteGalleryAlbumDetailRecord) {
  const images = album.images.map((image) => presentImage(c, image));
  return {
    id: album.id,
    projectId: album.projectId,
    slug: album.slug,
    title: album.title,
    description: album.description,
    category: album.category,
    status: album.status,
    coverImageId: album.coverImageId,
    sortOrder: album.sortOrder,
    publishedAt: album.publishedAt,
    publishedRevisionAt: album.publishedRevisionAt,
    hasUnpublishedChanges: album.hasUnpublishedChanges,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    images,
    coverImage:
      images.find((image) => image.id === album.coverImageId) ?? null,
  };
}

function presentImage(c: GalleryContext, image: SiteGalleryStoredImage) {
  return {
    id: image.id,
    alt: image.alt,
    position: image.position,
    width: image.width,
    height: image.height,
    createdAt: image.createdAt,
    url: mediaUrl(c.env, image.key),
  };
}

async function readJson(c: GalleryContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}

function galleryImageKey(
  projectId: string,
  albumId: string,
  extension: InspectedImage['extension'],
): string {
  // Sólo el segmento final identifica al archivo y siempre es opaco.
  return `site-galleries/${projectId}/${albumId}/${crypto.randomUUID()}.${extension}`;
}

function safeOriginalName(name: string): string | null {
  const leaf = name.split(/[\\/]/).pop()?.trim();
  return leaf ? leaf.slice(0, 255) : null;
}

function inspectImage(
  bytes: Uint8Array,
  declaredContentType: AllowedImageMime,
): InspectedImage {
  const detected = detectImage(bytes);
  if (!detected) {
    throw new AppError(
      'validation_error',
      'El archivo no contiene una imagen JPG, PNG o WebP válida.',
    );
  }
  if (detected.contentType !== declaredContentType) {
    throw new AppError(
      'validation_error',
      `El MIME declarado (${declaredContentType}) no coincide con los bytes del archivo (${detected.contentType}).`,
    );
  }
  return detected;
}

function detectImage(bytes: Uint8Array): InspectedImage | null {
  if (isPng(bytes)) {
    const dimensions = readPngDimensions(bytes);
    return dimensions
      ? { contentType: 'image/png', extension: 'png', ...dimensions }
      : null;
  }
  if (isJpeg(bytes)) {
    const dimensions = readJpegDimensions(bytes);
    return dimensions
      ? { contentType: 'image/jpeg', extension: 'jpg', ...dimensions }
      : null;
  }
  if (isWebp(bytes)) {
    const dimensions = readWebpDimensions(bytes);
    return dimensions
      ? { contentType: 'image/webp', extension: 'webp', ...dimensions }
      : null;
  }
  return null;
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return (
    bytes.length >= 24 &&
    signature.every((value, index) => bytes[index] === value) &&
    ascii(bytes, 12, 4) === 'IHDR'
  );
}

function readPngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const width = readUint32Be(bytes, 16);
  const height = readUint32Be(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

function readJpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = readUint16Be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = readUint16Be(bytes, offset + 3);
      const width = readUint16Be(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  );
}

function readWebpDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, 4);
    const chunkSize = readUint32Le(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) return null;

    if (chunkType === 'VP8X' && chunkSize >= 10) {
      return {
        width: readUint24Le(bytes, dataOffset + 4) + 1,
        height: readUint24Le(bytes, dataOffset + 7) + 1,
      };
    }
    if (
      chunkType === 'VP8 ' &&
      chunkSize >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      return {
        width: readUint16Le(bytes, dataOffset + 6) & 0x3fff,
        height: readUint16Le(bytes, dataOffset + 8) & 0x3fff,
      };
    }
    if (
      chunkType === 'VP8L' &&
      chunkSize >= 5 &&
      bytes[dataOffset] === 0x2f
    ) {
      const packed =
        ((bytes[dataOffset + 1] ?? 0) |
          ((bytes[dataOffset + 2] ?? 0) << 8) |
          ((bytes[dataOffset + 3] ?? 0) << 16) |
          ((bytes[dataOffset + 4] ?? 0) << 24)) >>>
        0;
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
      };
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return null;
}

function assertReasonableDimensions(width: number, height: number): void {
  const pixels = width * height;
  if (
    width < SITE_GALLERY_MIN_IMAGE_DIMENSION ||
    height < SITE_GALLERY_MIN_IMAGE_DIMENSION ||
    width > SITE_GALLERY_MAX_IMAGE_DIMENSION ||
    height > SITE_GALLERY_MAX_IMAGE_DIMENSION ||
    pixels > SITE_GALLERY_MAX_IMAGE_PIXELS
  ) {
    throw new AppError(
      'validation_error',
      `Dimensiones no permitidas: ${width}×${height}px. Cada lado debe medir entre ${SITE_GALLERY_MIN_IMAGE_DIMENSION} y ${SITE_GALLERY_MAX_IMAGE_DIMENSION}px, con un máximo de ${SITE_GALLERY_MAX_IMAGE_PIXELS.toLocaleString('es-MX')} píxeles.`,
    );
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return value;
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function toHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0');
  return output;
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

async function deleteOrphanedObjects(
  c: GalleryContext,
  images: SiteGalleryStoredImage[],
): Promise<void> {
  for (const image of images) {
    try {
      await c.env.MEDIA.delete(image.key);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'site_gallery.publication_asset_cleanup_failed',
          key: image.key,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
