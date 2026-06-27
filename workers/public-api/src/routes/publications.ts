import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  listPublicationsQuerySchema,
  paginationQuerySchema,
  parseInput,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { mediaUrl } from '../lib/media';

export const publications = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** GET /publications — listado público paginado (solo publicadas). */
publications.get('/', async (c) => {
  const query = c.req.query();
  const { page, pageSize } = parseInput(paginationQuerySchema, query);
  const { q } = parseInput(listPublicationsQuerySchema, query);

  const repos = createRepositories(c.env.DB);
  const result = await repos.publications.listPublished({ page, pageSize }, q);
  return c.json(result);
});

/** GET /publications/:slug — detalle público con imágenes. */
publications.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const repos = createRepositories(c.env.DB);

  const pub = await repos.publications.getPublishedBySlug(slug);
  if (!pub) throw AppError.notFound('Publicación');

  const images = await repos.publications.listImages(pub.id);
  return c.json({
    ...pub,
    images: images.map((img) => ({
      id: img.id,
      url: mediaUrl(c, img.key),
      alt: img.alt,
      position: img.position,
    })),
  });
});
