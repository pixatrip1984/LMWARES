import { Hono } from 'hono';
import { AppError, type SiteEventWithAvailability } from '@starter/domain';
import { createRepositories, SiteEventsRepository } from '@starter/db';
import {
  createSiteEventSchema,
  parseInput,
  siteEventParamsSchema,
  siteEventProjectParamsSchema,
  siteEventRegistrationParamsSchema,
  updateSiteEventRegistrationStatusSchema,
  updateSiteEventSchema,
  updateSiteEventStatusSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { mediaUrl } from '../lib/media';
import { requireStarterClientRuntime } from '../lib/starter-project-authorization';
import { requireWrite } from '../middleware/auth';

/**
 * Router relativo para:
 * /admin/projects/:projectId/modules/events
 */
export const siteEvents = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

siteEvents.use('*', async (c, next) => {
  await requireStarterClientRuntime(c.env.DB, c.req.param('projectId')!);
  await next();
});

siteEvents.get('/', async (c) => {
  const { projectId } = parseInput(siteEventProjectParamsSchema, c.req.param());
  const repository = await projectRepository(c.env.DB, projectId);
  const events = await repository.listAdmin(projectId);
  return c.json({ events: events.map((event) => adminEvent(c.env, event)) });
});

siteEvents.get('/published', async (c) => {
  const { projectId } = parseInput(siteEventProjectParamsSchema, c.req.param());
  const repository = await projectRepository(c.env.DB, projectId);
  const events = await repository.listPublic(projectId);
  return c.json({ events: events.map((event) => adminEvent(c.env, event)) });
});

siteEvents.get('/:eventId', async (c) => {
  const { projectId, eventId } = parseInput(siteEventParamsSchema, c.req.param());
  const repository = await projectRepository(c.env.DB, projectId);
  const event = await repository.getAdminById(projectId, eventId);
  if (!event) throw AppError.notFound('Evento');
  const registrations = await repository.listRegistrations(projectId, eventId);
  return c.json({ event: adminEvent(c.env, event), registrations });
});

siteEvents.post('/', requireWrite, async (c) => {
  const { projectId } = parseInput(siteEventProjectParamsSchema, c.req.param());
  const input = parseInput(createSiteEventSchema, await readJson(c));
  const repository = await projectRepository(c.env.DB, projectId);
  await assertCoverAsset(repository, input.coverAssetId);

  const event = await repository.create({
    projectId,
    ...input,
    actorEmail: c.get('admin').email,
  });
  if (!event) {
    throw new AppError('conflict', 'Ya existe un evento con ese slug en el proyecto.');
  }
  await recordAudit(c, projectId, event.id, 'lmwares.event.create', {
    status: event.status,
    slug: event.slug,
  });
  return c.json(adminEvent(c.env, event), 201);
});

siteEvents.patch('/:eventId', requireWrite, async (c) => {
  const { projectId, eventId } = parseInput(siteEventParamsSchema, c.req.param());
  const input = parseInput(updateSiteEventSchema, await readJson(c));
  const repository = await projectRepository(c.env.DB, projectId);
  await assertCoverAsset(repository, input.coverAssetId);

  const result = await repository.update(projectId, eventId, input, c.get('admin').email);
  if (result.kind === 'not_found') throw AppError.notFound('Evento');
  if (result.kind === 'slug_conflict') {
    throw new AppError('conflict', 'Ya existe un evento con ese slug en el proyecto.');
  }
  if (result.kind === 'capacity_below_confirmed') {
    throw new AppError(
      'conflict',
      `El cupo no puede ser menor que los ${result.confirmed} asistentes confirmados.`,
    );
  }
  await recordAudit(c, projectId, eventId, 'lmwares.event.update', {
    status: result.event.status,
  });
  return c.json(adminEvent(c.env, result.event));
});

siteEvents.patch('/:eventId/status', requireWrite, async (c) => {
  const { projectId, eventId } = parseInput(siteEventParamsSchema, c.req.param());
  const { status } = parseInput(updateSiteEventStatusSchema, await readJson(c));
  const repository = await projectRepository(c.env.DB, projectId);
  const existing = await repository.getAdminById(projectId, eventId);
  if (!existing) throw AppError.notFound('Evento');
  if (status === 'published' && existing.startsAtUtc <= new Date().toISOString()) {
    throw new AppError(
      'validation_error',
      'No se puede publicar un evento cuya fecha de inicio ya pasó.',
    );
  }

  const event = await repository.setStatus(projectId, eventId, status, c.get('admin').email);
  if (!event) throw AppError.notFound('Evento');
  await recordAudit(c, projectId, eventId, 'lmwares.event.status', {
    from: existing.status,
    to: status,
  });
  return c.json(adminEvent(c.env, event));
});

siteEvents.get('/:eventId/registrations', async (c) => {
  const { projectId, eventId } = parseInput(siteEventParamsSchema, c.req.param());
  const repository = await projectRepository(c.env.DB, projectId);
  const event = await repository.getAdminById(projectId, eventId);
  if (!event) throw AppError.notFound('Evento');
  return c.json({
    event: adminEvent(c.env, event),
    registrations: await repository.listRegistrations(projectId, eventId),
  });
});

siteEvents.patch('/:eventId/registrations/:registrationId', requireWrite, async (c) => {
  const { projectId, eventId, registrationId } = parseInput(
    siteEventRegistrationParamsSchema,
    c.req.param(),
  );
  const { status } = parseInput(updateSiteEventRegistrationStatusSchema, await readJson(c));
  const repository = await projectRepository(c.env.DB, projectId);
  const result = await repository.setRegistrationStatus(projectId, eventId, registrationId, status);
  if (result.kind === 'not_found') throw AppError.notFound('Inscripción');
  if (result.kind === 'full') {
    throw new AppError('conflict', 'El evento ya alcanzó su cupo.');
  }
  await recordAudit(c, projectId, eventId, 'lmwares.event.registration.status', {
    registrationId,
    status,
  });
  return c.json(result.registration);
});

async function projectRepository(
  db: Bindings['DB'],
  projectId: string,
): Promise<SiteEventsRepository> {
  const repository = new SiteEventsRepository(db);
  if (!(await repository.projectExists(projectId))) {
    throw AppError.notFound('Proyecto');
  }
  return repository;
}

async function assertCoverAsset(
  repository: SiteEventsRepository,
  coverAssetId: string | null,
): Promise<void> {
  if (coverAssetId && !(await repository.coverAssetExists(coverAssetId))) {
    throw new AppError('validation_error', 'La portada seleccionada no existe.');
  }
}

function adminEvent(env: Bindings, event: SiteEventWithAvailability) {
  return {
    ...event,
    coverUrl: event.cover ? mediaUrl(env, event.cover.key) : null,
  };
}

async function recordAudit(
  c: {
    env: Bindings;
    get: (key: 'admin') => Variables['admin'];
    req: { header: (name: string) => string | undefined };
  },
  projectId: string,
  eventId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const repos = createRepositories(c.env.DB);
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action,
    entityType: 'lmwares_project',
    entityId: projectId,
    metadata: { eventId, ...metadata },
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
