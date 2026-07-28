import { Hono } from 'hono';
import type { Context } from 'hono';
import { AppError } from '@starter/domain';
import { parseInput } from '@starter/validation';
import {
  SiteGalleryRepository,
  type SiteGalleryAlbumDetailRecord,
  type SiteGalleryAlbumSummaryRecord,
  type SiteGalleryStoredImage,
} from '@starter/db';
import {
  listPublicSiteGalleriesQuerySchema,
  siteGalleryProjectIdSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { mediaUrl } from '../lib/media';

type GalleryContext = Context<{
  Bindings: Bindings;
  Variables: Variables;
}>;

/**
 * Montaje esperado:
 * app.route('/sites/:projectId/galleries', publicSiteGalleries)
 *
 * El álbum es la categoría navegable: "/" lista álbumes y "/:slug" resuelve
 * una sola categoría/álbum publicada.
 */
export const publicSiteGalleries = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

publicSiteGalleries.get('/', async (c) => {
  const projectId = readProjectId(c);
  const { q } = parseInput(
    listPublicSiteGalleriesQuerySchema,
    c.req.query(),
  );
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const albums = await gallery.listPublished(projectId, q);
  return c.json({
    projectId,
    albums: albums.map((album) => presentSummary(c, album)),
  });
});

publicSiteGalleries.get('/:slug', async (c) => {
  const projectId = readProjectId(c);
  const slug = c.req.param('slug');
  const gallery = new SiteGalleryRepository(c.env.DB);
  await assertProject(gallery, projectId);
  const album = await gallery.getPublishedBySlug(projectId, slug);
  if (!album) throw AppError.notFound('Álbum');
  return c.json(presentDetail(c, album));
});

function readProjectId(c: GalleryContext): string {
  return parseInput(siteGalleryProjectIdSchema, c.req.param('projectId'));
}

async function assertProject(
  gallery: SiteGalleryRepository,
  projectId: string,
): Promise<void> {
  if (!(await gallery.projectExists(projectId))) {
    throw AppError.notFound('Proyecto');
  }
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
    url: mediaUrl(c, image.key),
  };
}
