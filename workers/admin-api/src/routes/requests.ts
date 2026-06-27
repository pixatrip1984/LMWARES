import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  createRequestNoteSchema,
  listRequestsQuerySchema,
  paginationQuerySchema,
  parseInput,
  updateRequestStatusSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';

export const requests = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** GET /admin/requests — listado con filtros. */
requests.get('/', async (c) => {
  const query = c.req.query();
  const { page, pageSize } = parseInput(paginationQuerySchema, query);
  const { status, type } = parseInput(listRequestsQuerySchema, query);
  const repos = createRepositories(c.env.DB);
  return c.json(await repos.requests.listAll({ page, pageSize, status, type }));
});

/** GET /admin/requests/:id — detalle con notas e historial. */
requests.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);

  const request = await repos.requests.getById(id);
  if (!request) throw AppError.notFound('Solicitud');

  const [notes, history] = await Promise.all([
    repos.requests.listNotes(id),
    repos.statusHistory.listForEntity('request', id),
  ]);
  return c.json({ request, notes, history });
});

/** PATCH /admin/requests/:id/status — cambiar estado + historial. */
requests.patch('/:id/status', requireWrite, async (c) => {
  const id = c.req.param('id')!;
  const { status, reason } = parseInput(updateRequestStatusSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);

  const existing = await repos.requests.getById(id);
  if (!existing) throw AppError.notFound('Solicitud');

  const updated = await repos.requests.setStatus(id, status);
  await repos.statusHistory.record({
    entityType: 'request',
    entityId: id,
    fromStatus: existing.status,
    toStatus: status,
    changedBy: c.get('admin').email,
    reason: reason ?? null,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'request.status',
    entityType: 'request',
    entityId: id,
    metadata: { from: existing.status, to: status },
  });
  return c.json(updated);
});

/** POST /admin/requests/:id/notes — agregar nota interna. */
requests.post('/:id/notes', requireWrite, async (c) => {
  const id = c.req.param('id')!;
  const { body } = parseInput(createRequestNoteSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);

  const existing = await repos.requests.getById(id);
  if (!existing) throw AppError.notFound('Solicitud');

  const note = await repos.requests.addNote({
    requestId: id,
    authorEmail: c.get('admin').email,
    body,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'request.note.add',
    entityType: 'request',
    entityId: id,
    metadata: { noteId: note.id },
  });
  return c.json(note, 201);
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}
