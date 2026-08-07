import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError } from '@starter/domain';
import { parseList } from '@starter/config';
import type { Bindings, Variables } from './env';
import { onError } from './middleware/error';
import { freeJobsInternal } from './routes/free-jobs-internal';
import { stuckPaymentsInternal } from './routes/stuck-payments-internal';
import { googleIndexingInternal } from './routes/google-indexing-internal';
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
import { maintenanceSubscriptions } from './routes/maintenance-subscriptions';
import { account } from './routes/account';
import { mapLocations } from './routes/map-locations';
import { reconcileSubscriptionsOnSchedule } from './lib/subscription-reconciliation';
import { commercialIntakes } from './routes/commercial-intakes';
import { serveStarterSite, serveStarterSiteByHostname, starterSites } from './routes/starter-sites';
import { starterDomains } from './routes/starter-domains';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Correlación de peticiones
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// `www.lmwares.com` y `contratar.lmwares.com` no deben servir contenido
// duplicado del apex: aunque el DNS/Custom Domain de Pages podría servir el
// mismo build, el wildcard de rutas de este Worker (`*.lmwares.com/*`) puede
// ganarle la precedencia de enrutamiento de Cloudflare en algunos casos, así
// que redirigimos explícitamente aquí para no depender de esa precedencia.
// 301 permanente, preserva path y query. Dominio único canónico: lmwares.com.
const LEGACY_APEX_ALIASES = new Set(['www.lmwares.com', 'contratar.lmwares.com']);
app.use('*', async (c, next) => {
  const host = ((c.req.header('Host') ?? '').toLowerCase().split(':')[0] ?? '');
  if (LEGACY_APEX_ALIASES.has(host)) {
    const url = new URL(c.req.url);
    url.hostname = 'lmwares.com';
    url.protocol = 'https:';
    return c.redirect(url.toString(), 301);
  }
  await next();
});

// CORS dinámico según ALLOWED_ORIGINS (lista separada por comas)
app.use('*', (c, next) => {
  const allowed = parseList(c.env.ALLOWED_ORIGINS);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key'],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

app.onError(onError);
app.notFound((c) =>
  c.json(new AppError('not_found', 'Ruta no encontrada.').toBody(c.get('requestId')), 404),
);

app.get('/health', (c) => c.json({ ok: true, service: 'public-api' }));

app.route('/auth', authRoutes);
app.route('/account', account);
app.route('/payments', payments);
app.route('/subscriptions', subscriptions);
app.route('/maintenance-subscriptions', maintenanceSubscriptions);
app.route('/commercial-intakes', commercialIntakes);
app.route('/publications', publications);
app.route('/requests', requests);
app.route('/free', freeIntakes);
app.route('/map', mapLocations);
app.route('/internal', freeJobsInternal);
app.route('/internal', stuckPaymentsInternal);
app.route('/internal', googleIndexingInternal);
app.route('/sites/:projectId/blog', siteBlogPublic);
app.route('/sites/:projectId/galleries', publicSiteGalleries);
app.route('/sites/:projectId/docs', siteDocsPublic);
app.route('/sites/:projectId/documents', siteDocsPublic);
app.route('/sites/:projectId/forms', siteForms);
app.route('/sites/:projectId/events', siteEvents);
app.route('/sites', freeSites);
app.route('/starter-sites', starterSites);
app.route('/starter-projects', starterDomains);

// El mismo Worker atiende el wildcard `*.sitios.lmwares.com/*` (sitios de
// clientes, namespace dedicado y separado de nuestras herramientas propias
// como contratar/admin/api) y los hostnames personalizados activos de
// Cloudflare for SaaS en producción.
app.get('/', async (c) => {
  const hostname = hostnameFromHostHeader(c.req.header('Host'));
  const slug = freeSlugFromHost(hostname, c.env.FREE_SITE_BASE_DOMAIN);

  if (slug) {
    const starterResponse = await serveStarterSite(c, slug);
    if (starterResponse) return starterResponse;
    return serveFreeSite(c, slug);
  }

  if (hostname) {
    const customDomainResponse = await serveStarterSiteByHostname(c, hostname);
    if (customDomainResponse) return customDomainResponse;
  }

  throw AppError.notFound('Sitio');
});

/**
 * GET /media/<key> — proxy de lectura desde R2. Permite servir imágenes sin
 * exponer R2 al navegador ni requerir un dominio público (ideal en local).
 */
app.get('/media/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  if (/^sites\/[^/]+\/docs\//.test(key) || /^free-intakes\/[^/]+\/original\//.test(key)) {
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

function hostnameFromHostHeader(hostHeader: string | undefined): string | null {
  const raw = (hostHeader ?? '').trim().toLowerCase();
  if (!raw || raw.startsWith('[')) return null;

  const match = /^([^:]+)(?::[0-9]+)?$/.exec(raw);
  if (!match) return null;

  const hostname = match[1]!;
  if (hostname.endsWith('.') || !/^[a-z0-9.-]+$/.test(hostname)) {
    return null;
  }
  return hostname;
}

function freeSlugFromHost(hostname: string | null, baseDomain: string): string | null {
  const host = hostname ?? '';
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug) ? slug : null;
}
