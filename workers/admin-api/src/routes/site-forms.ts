import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { SiteFormsRepository } from '@starter/db';
import {
  createSiteFormRequestNoteSchema,
  listSiteFormRequestsQuerySchema,
  parseInput,
  siteFormDefinitionSchema,
  updateSiteFormRequestStatusSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';

/**
 * Montaje esperado:
 * app.route('/admin/projects/:projectId/modules/forms', siteForms)
 */
export const siteForms = new Hono<{ Bindings: Bindings; Variables: Variables }>();

siteForms.get('/', async (c) => {
  const projectId = c.req.param('projectId')!;
  const repository = new SiteFormsRepository(c.env.DB);
  const form = await repository.ensureForProject(projectId, c.get('admin').email);
  if (!form) throw AppError.notFound('Proyecto');

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
  return c.json(note, 201);
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}
