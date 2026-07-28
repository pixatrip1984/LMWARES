import { Hono } from 'hono';
import {
  AppError,
  type PublicSiteEvent,
  type SiteEventWithAvailability,
} from '@starter/domain';
import { SiteEventsRepository } from '@starter/db';
import {
  createSiteEventRegistrationSchema,
  parseInput,
  siteEventParamsSchema,
  siteEventProjectParamsSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { mediaUrl } from '../lib/media';

/**
 * Router relativo para:
 * /sites/:projectId/events
 */
export const siteEvents = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

siteEvents.get('/', async (c) => {
  const { projectId } = parseInput(siteEventProjectParamsSchema, c.req.param());
  const repository = await projectRepository(c.env.DB, projectId);
  const events = await repository.listPublic(projectId);
  return c.json({ events: events.map((event) => publicEvent(c, event)) });
});

siteEvents.get('/:eventId', async (c) => {
  const { projectId, eventId } = parseInput(siteEventParamsSchema, c.req.param());
  const repository = await projectRepository(c.env.DB, projectId);
  const event = await repository.getPublicById(projectId, eventId);
  if (!event) throw AppError.notFound('Evento');
  return c.json({ event: publicEvent(c, event) });
});

siteEvents.post('/:eventId/registrations', async (c) => {
  const { projectId, eventId } = parseInput(siteEventParamsSchema, c.req.param());
  const input = parseInput(createSiteEventRegistrationSchema, await readJson(c));
  const repository = await projectRepository(c.env.DB, projectId);
  const result = await repository.register({
    projectId,
    eventId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
  });

  if (result.kind === 'not_found') throw AppError.notFound('Evento');
  if (result.kind === 'already_registered') {
    throw new AppError('conflict', 'Este email ya está inscrito en el evento.');
  }
  if (result.kind === 'full') {
    throw new AppError('conflict', 'El evento ya alcanzó su cupo.');
  }
  if (result.kind === 'unavailable') {
    throw new AppError('conflict', 'La inscripción para este evento está cerrada.');
  }

  return c.json(
    {
      registration: {
        id: result.registration.id,
        status: result.registration.status,
        createdAt: result.registration.createdAt,
      },
      event: publicEvent(c, result.event),
    },
    201,
  );
});

async function projectRepository(
  db: Bindings['DB'],
  projectId: string,
): Promise<SiteEventsRepository> {
  const repository = new SiteEventsRepository(db);
  if (!(await repository.projectExists(projectId))) {
    throw AppError.notFound('Sitio');
  }
  return repository;
}

function publicEvent(
  c: Parameters<typeof mediaUrl>[0],
  event: SiteEventWithAvailability,
): PublicSiteEvent {
  const { cover, createdBy: _createdBy, updatedBy: _updatedBy, ...safeEvent } = event;
  return {
    ...safeEvent,
    coverUrl: cover ? mediaUrl(c, cover.key) : null,
  };
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}
