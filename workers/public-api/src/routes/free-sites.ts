import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';

export const freeSites = new Hono<{ Bindings: Bindings; Variables: Variables }>();

freeSites.get('/:slug', async (c) => {
  const slug = c.req.param('slug')!;
  const repos = createRepositories(c.env.DB);
  const site = await repos.lmwaresFreeIntakes.getPublishedSiteBySlug(slug);
  if (!site) throw AppError.notFound('Sitio Free');

  const object = await c.env.MEDIA.get(site.indexKey);
  if (!object) throw AppError.notFound('Artefacto publicado');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=120');
  headers.set('x-lmwares-free-site', slug);
  return new Response(object.body, { headers });
});
