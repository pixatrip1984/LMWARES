import { Hono, type Context } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  FREE_SITE_RESPONSIVE_CSS,
  FREE_SITE_RESPONSIVE_STYLE_ID,
} from '../../../../scripts/lmwares-free-site-runner/generator.mjs';
import type { Bindings, Variables } from '../env';

export const freeSites = new Hono<{ Bindings: Bindings; Variables: Variables }>();

freeSites.get('/:slug', async (c) => {
  const slug = c.req.param('slug')!;
  return serveFreeSite(c, slug);
});

export async function serveFreeSite(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  slug: string,
) {
  const repos = createRepositories(c.env.DB);
  const site = await repos.lmwaresFreeIntakes.getPublishedSiteBySlug(slug);
  if (!site) throw AppError.notFound('Sitio Free');

  const object = await c.env.MEDIA.get(site.indexKey);
  if (!object) throw AppError.notFound('Artefacto publicado');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const html = await object.text();
  const responsiveHtml = injectResponsiveStyles(html);
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=120');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-lmwares-free-site', slug);
  return new Response(responsiveHtml, { headers });
}

export function injectResponsiveStyles(html: string): string {
  if (html.includes(`id="${FREE_SITE_RESPONSIVE_STYLE_ID}"`)) return html;

  const style = `<style id="${FREE_SITE_RESPONSIVE_STYLE_ID}">${FREE_SITE_RESPONSIVE_CSS}</style>`;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${style}</head>`)
    : `${style}${html}`;
}
