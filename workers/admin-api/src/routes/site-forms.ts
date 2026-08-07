import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories, SiteFormsRepository } from '@starter/db';
import {
  createSiteFormRequestNoteSchema,
  listSiteFormRequestsQuerySchema,
  parseInput,
  siteFormDefinitionSchema,
  updateSiteFormRequestStatusSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireStarterClientRuntime } from '../lib/starter-project-authorization';
import { requireWrite } from '../middleware/auth';

/**
 * Montaje esperado:
 * app.route('/admin/projects/:projectId/modules/forms', siteForms)
 */
export const siteForms = new Hono<{ Bindings: Bindings; Variables: Variables }>();

siteForms.use('*', async (c, next) => {
  await requireStarterClientRuntime(c.env.DB, c.req.param('projectId')!);
  await next();
});

siteForms.get('/', async (c) => {
  const projectId = c.req.param('projectId')!;
  const repository = new SiteFormsRepository(c.env.DB);
  if (!(await repository.projectExists(projectId))) throw AppError.notFound('Proyecto');
  const form = await repository.getByProjectId(projectId);
  if (!form) throw AppError.notFound('Formulario');

  const requests = await repository.listRequests(projectId, {
    page: 1,
    pageSize: 50,
  });
  return c.json({ form, requests });
});

siteForms.post('/initialize', requireWrite, async (c) => {
  const projectId = c.req.param('projectId')!;
  const repository = new SiteFormsRepository(c.env.DB);
  const existing = await repository.getByProjectId(projectId);
  const form = await repository.ensureForProject(projectId, c.get('admin').email);
  if (!form) throw AppError.notFound('Proyecto');
  if (!existing) {
    await audit(c, projectId, 'site_form.create', {
      formId: form.id,
      draftRevision: form.draftRevision,
    });
  }

  const requests = await repository.listRequests(projectId, {
    page: 1,
    pageSize: 50,
  });
  return c.json({ form, requests });
});

siteForms.patch('/definition', requireWrite, async (c) => {
  const projectId = c.req.param('projectId')!;
  const definition = parseInput(siteFormDefinitionSchema, await readJson(c));
  const repository = new SiteFormsRepository(c.env.DB);
  const form = await repository.saveDraft(projectId, definition, c.get('admin').email);
  if (!form) throw AppError.notFound('Proyecto');
  await audit(c, projectId, 'site_form.draft.update', {
    formId: form.id,
    draftRevision: form.draftRevision,
  });
  return c.json(form);
});

siteForms.post('/publish', requireWrite, async (c) => {
  const projectId = c.req.param('projectId')!;
  const repository = new SiteFormsRepository(c.env.DB);
  const current = await repository.ensureForProject(projectId, c.get('admin').email);
  if (!current) throw AppError.notFound('Proyecto');

  parseInput(siteFormDefinitionSchema, current.draftDefinition);
  const form = await repository.publish(projectId, c.get('admin').email);
  if (!form) throw AppError.notFound('Formulario');
  await audit(c, projectId, 'site_form.publish', {
    formId: form.id,
    revision: form.publishedRevision,
    publishedAt: form.publishedAt,
  });
  return c.json(form);
});

siteForms.get('/requests', async (c) => {
  const projectId = c.req.param('projectId')!;
  const query = parseInput(listSiteFormRequestsQuerySchema, c.req.query());
  const repository = new SiteFormsRepository(c.env.DB);
  if (!(await repository.projectExists(projectId))) throw AppError.notFound('Proyecto');
  return c.json(await repository.listRequests(projectId, query));
});

siteForms.get('/requests/:requestId', async (c) => {
  const repository = new SiteFormsRepository(c.env.DB);
  const detail = await repository.getRequestDetail(
    c.req.param('projectId')!,
    c.req.param('requestId')!,
  );
  if (!detail) throw AppError.notFound('Solicitud');
  return c.json(detail);
});

siteForms.patch('/requests/:requestId/status', requireWrite, async (c) => {
  const input = parseInput(updateSiteFormRequestStatusSchema, await readJson(c));
  const repository = new SiteFormsRepository(c.env.DB);
  const request = await repository.setRequestStatus({
    projectId: c.req.param('projectId')!,
    requestId: c.req.param('requestId')!,
    status: input.status,
    changedBy: c.get('admin').email,
    reason: input.reason ?? null,
  });
  if (!request) throw AppError.notFound('Solicitud');
  await audit(c, c.req.param('projectId')!, 'site_form.request.status', {
    formId: request.formId,
    requestId: request.id,
    status: request.status,
  });
  return c.json(request);
});

siteForms.post('/requests/:requestId/notes', requireWrite, async (c) => {
  const input = parseInput(createSiteFormRequestNoteSchema, await readJson(c));
  const repository = new SiteFormsRepository(c.env.DB);
  const note = await repository.addRequestNote({
    projectId: c.req.param('projectId')!,
    requestId: c.req.param('requestId')!,
    authorEmail: c.get('admin').email,
    body: input.body,
  });
  if (!note) throw AppError.notFound('Solicitud');
  const request = await repository.getRequestById(c.req.param('projectId')!, c.req.param('requestId')!);
  if (request) {
    await audit(c, c.req.param('projectId')!, 'site_form.request.note.add', {
      formId: request.formId,
      requestId: request.id,
      noteId: note.id,
    });
  }
  return c.json(note, 201);
});

async function audit(
  c: {
    env: Bindings;
    get: (key: 'admin') => Variables['admin'];
    req: { header: (name: string) => string | undefined };
  },
  projectId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createRepositories(c.env.DB).audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action,
    entityType: 'lmwares_project',
    entityId: projectId,
    metadata,
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}
