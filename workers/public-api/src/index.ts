import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError } from '@starter/domain';
import { parseList } from '@starter/config';
import type { Bindings, Variables } from './env';
import { onError } from './middleware/error';
import { freeJobsInternal } from './routes/free-jobs-internal';
import { freeIntakes } from './routes/free-intakes';
import { freeSites } from './routes/free-sites';
import { publications } from './routes/publications';
import { requests } from './routes/requests';
import { siteBlogPublic } from './routes/site-blog';
import { publicSiteGalleries } from './routes/site-gallery';
import { siteDocsPublic } from './routes/site-docs';
import { siteForms } from './routes/site-forms';
import { siteEvents } from './routes/site-events';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Correlación de peticiones
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// CORS dinámico según ALLOWED_ORIGINS (lista separada por comas)
app.use('*', (c, next) => {
  const allowed = parseList(c.env.ALLOWED_ORIGINS);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })(c, next);
});

app.onError(onError);
app.notFound((c) =>
  c.json(
    new AppError('not_found', 'Ruta no encontrada.').toBody(c.get('requestId')),
    404,
  ),
);

app.get('/health', (c) => c.json({ ok: true, service: 'public-api' }));

app.route('/publications', publications);
app.route('/requests', requests);
app.route('/free', freeIntakes);
app.route('/internal', freeJobsInternal);
app.route('/sites/:projectId/blog', siteBlogPublic);
app.route('/sites/:projectId/galleries', publicSiteGalleries);
app.route('/sites/:projectId/docs', siteDocsPublic);
app.route('/sites/:projectId/forms', siteForms);
app.route('/sites/:projectId/events', siteEvents);
app.route('/sites', freeSites);

/**
 * GET /media/<key> — proxy de lectura desde R2. Permite servir imágenes sin
 * exponer R2 al navegador ni requerir un dominio público (ideal en local).
 */
app.get('/media/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  if (/^sites\/[^/]+\/docs\//.test(key)) {
    // Los documentos tienen permisos, estado y cabeceras de descarga propios.
    // Nunca deben salir por el proxy genérico de medios.
    throw AppError.notFound('Archivo');
  }
  const object = await c.env.MEDIA.get(key);
  if (!object) throw AppError.notFound('Archivo');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  return new Response(object.body, { headers });
});

export default app;
