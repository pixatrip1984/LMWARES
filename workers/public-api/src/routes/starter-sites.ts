import { Hono, type Context } from 'hono';
import { AppError, type StarterClientProject } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';

export const starterSites = new Hono<{ Bindings: Bindings; Variables: Variables }>();

starterSites.get('/:slug', async (c) => {
  const slug = c.req.param('slug')!;
  const response = await serveStarterSite(c, slug);
  if (!response) throw AppError.notFound('Sitio Starter');
  return response;
});

/**
 * Resolves only a client-owned Starter project. Returning null lets the
 * wildcard handler continue with the legacy Free-site resolver.
 */
export async function serveStarterSite(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  slug: string,
): Promise<Response | null> {
  const repos = createRepositories(c.env.DB);
  const project = await repos.lmwaresStarterClientProjects.getBySlug(slug);
  if (!project) return null;
  return serveStarterSiteProject(c, project);
}

/**
 * Resolves a custom hostname only after the domain provider has marked it
 * active. The project renderer is shared with the managed subdomain so both
 * entry points enforce the same work-order and archival gates.
 */
export async function serveStarterSiteByHostname(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  hostname: string,
): Promise<Response | null> {
  const repos = createRepositories(c.env.DB);
  const domain = await repos.lmwaresCustomDomains.getActiveByHostname(hostname);
  if (!domain) return null;

  const project = await repos.lmwaresStarterClientProjects.getById(domain.clientProjectId);
  if (!project) throw AppError.notFound('Sitio Starter');
  return serveStarterSiteProject(c, project);
}

async function serveStarterSiteProject(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  project: StarterClientProject,
): Promise<Response> {
  const repos = createRepositories(c.env.DB);

  if (project.status === 'archived') throw AppError.notFound('Sitio Starter');

  const workOrder = await repos.lmwaresStarterWorkOrders.getById(project.workOrderId);
  if (!workOrder || workOrder.status === 'canceled') {
    throw AppError.notFound('Sitio Starter');
  }

  return renderStarterSiteStatus({
    siteName: project.siteName,
    slug: project.slug,
    projectStatus: project.status,
    workOrderStatus: workOrder.status,
    publishedUrl: workOrder.publishedUrl,
    baseDomain: c.env.FREE_SITE_BASE_DOMAIN,
  });
}

export function renderStarterSiteStatus(input: {
  siteName: string;
  slug: string;
  projectStatus: string;
  workOrderStatus: string;
  publishedUrl: string | null;
  baseDomain: string;
}): Response {
  const publishedUrl = safePublishedUrl(input.publishedUrl, input.baseDomain);
  const state = starterStatusCopy(input.workOrderStatus);
  const link = publishedUrl
    ? `<p><a href="${escapeHtml(publishedUrl)}">Abrir la entrega publicada</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.siteName)} · LMWares</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f8fb; color: #172033; }
      main { width: min(34rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #dce4ef; border-radius: 1.25rem; background: white; box-shadow: 0 1rem 3rem rgb(23 32 51 / 8%); }
      p { color: #55708f; line-height: 1.6; }
      small { color: #7890aa; }
      a { color: #155eef; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <small>LMWares · proyecto Starter</small>
      <h1>${escapeHtml(input.siteName)}</h1>
      <p>${state.title}</p>
      <p>${state.description}</p>
      ${link}
      <small>Estado técnico: ${escapeHtml(input.projectStatus)} · ${escapeHtml(input.slug)}.${escapeHtml(input.baseDomain)}</small>
    </main>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-lmwares-site-type': 'starter',
    },
  });
}

export function starterStatusCopy(workOrderStatus: string): {
  title: string;
  description: string;
} {
  switch (workOrderStatus) {
    case 'awaiting_provisioning':
      return {
        title: 'Estamos preparando tu proyecto.',
        description:
          'Tu primer pago fue confirmado y el equipo ya tiene reservado este espacio de seguimiento.',
      };
    case 'in_build':
      return {
        title: 'Tu proyecto está en construcción.',
        description:
          'Estamos trabajando en el alcance acordado. Este enlace permanecerá disponible para seguir el avance.',
      };
    case 'client_review':
      return {
        title: 'Tu proyecto está listo para revisión.',
        description:
          'El equipo está validando la entrega y te avisará cuando haya una versión lista para publicar.',
      };
    case 'ready_to_publish':
      return {
        title: 'Tu proyecto está listo para publicar.',
        description:
          'La entrega superó la revisión y queda pendiente la compuerta operativa de publicación.',
      };
    case 'live':
      return {
        title: 'Tu proyecto está publicado.',
        description:
          'Este subdominio administrado conserva una ruta de recuperación para tu sitio.',
      };
    default:
      return {
        title: 'Tu proyecto está siendo preparado.',
        description: 'El estado de la entrega se actualizará aquí cuando avance el trabajo.',
      };
  }
}

function safePublishedUrl(value: string | null, baseDomain: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const suffix = `.${baseDomain.toLowerCase()}`;
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (hostname === baseDomain.toLowerCase() || hostname.endsWith(suffix))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}
