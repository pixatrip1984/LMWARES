import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError } from '@starter/domain';
import { parseList } from '@starter/config';
import type { Bindings, Variables } from './env';
import { onError } from './middleware/error';
import { freeJobsInternal } from './routes/free-jobs-internal';
import { freeIntakes } from './routes/free-intakes';
import { freeSites, serveFreeSite } from './routes/free-sites';
import { publications } from './routes/publications';
import { requests } from './routes/requests';
import { siteBlogPublic } from './routes/site-blog';
import { publicSiteGalleries } from './routes/site-gallery';
import { siteDocsPublic } from './routes/site-docs';
import { siteForms } from './routes/site-forms';
import { siteEvents } from './routes/site-events';
import { authRoutes } from './routes/auth';
import { payments } from './routes/payments';
import { subscriptions } from './routes/subscriptions';
import { account } from './routes/account';
import { mapLocations } from './routes/map-locations';
import { reconcileSubscriptionsOnSchedule } from './lib/subscription-reconciliation';
import { commercialIntakes } from './routes/commercial-intakes';

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
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key'],
    credentials: true,
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

app.route('/auth', authRoutes);
app.route('/account', account);
app.route('/payments', payments);
app.route('/subscriptions', subscriptions);
app.route('/commercial-intakes', commercialIntakes);
app.route('/publications', publications);
app.route('/requests', requests);
app.route('/free', freeIntakes);
app.route('/map', mapLocations);
app.route('/internal', freeJobsInternal);
app.route('/sites/:projectId/blog', siteBlogPublic);
app.route('/sites/:projectId/galleries', publicSiteGalleries);
app.route('/sites/:projectId/docs', siteDocsPublic);
app.route('/sites/:projectId/forms', siteForms);
app.route('/sites/:projectId/events', siteEvents);
app.route('/sites', freeSites);

// El mismo Worker atiende el wildcard `*.lmwares.com/*` en producción.
app.get('/', async (c) => {
  const slug = freeSlugFromHost(c.req.header('Host'), c.env.FREE_SITE_BASE_DOMAIN);
  if (!slug) throw AppError.notFound('Sitio Free');
  return serveFreeSite(c, slug);
});

/**
 * GET /media/<key> — proxy de lectura desde R2. Permite servir imágenes sin
 * exponer R2 al navegador ni requerir un dominio público (ideal en local).
 */
app.get('/media/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  if (
    /^sites\/[^/]+\/docs\//.test(key) ||
    /^free-intakes\/[^/]+\/original\//.test(key)
  ) {
    // Los documentos tienen permisos, estado y cabeceras de descarga propios.
    // Los originales Free permanecen en cuarentena. Ninguno debe salir por el
    // proxy genérico de medios.
    throw AppError.notFound('Archivo');
  }
  const object = await c.env.MEDIA.get(key);
  if (!object) throw AppError.notFound('Archivo');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
});

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(reconcileSubscriptionsOnSchedule(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Bindings>;

function freeSlugFromHost(hostHeader: string | undefined, baseDomain: string): string | null {
  const host = (hostHeader ?? '').split(':')[0]!.toLowerCase();
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug) ? slug : null;
}
