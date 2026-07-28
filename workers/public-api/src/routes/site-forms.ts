import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { SiteFormsRepository } from '@starter/db';
import {
  parseInput,
  publicSiteFormSubmissionSchema,
  siteFormDefinitionSchema,
  validatePublishedSiteFormAnswers,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { verifyTurnstile } from '../lib/turnstile';

const MAX_PUBLIC_BODY_BYTES = 64 * 1024;

/**
 * Montaje esperado:
 * app.route('/sites/:projectId/forms', siteForms)
 */
export const siteForms = new Hono<{ Bindings: Bindings; Variables: Variables }>();

siteForms.get('/', async (c) => {
  const repository = new SiteFormsRepository(c.env.DB);
  const published = await repository.getPublishedForProject(c.req.param('projectId')!);
  if (!published) throw AppError.notFound('Formulario público');

  const definition = parseInput(siteFormDefinitionSchema, published.definition);
  c.header('Cache-Control', 'no-store');
  return c.json({
    projectId: published.projectId,
    revision: published.revision,
    publishedAt: published.publishedAt,
    definition,
  });
});

siteForms.post('/requests', async (c) => {
  const raw = await readBoundedJson(c);
  const input = parseInput(publicSiteFormSubmissionSchema, raw);

  // Respuesta indistinguible para bots; no se persiste ni se invoca Turnstile.
  if (input.website.trim().length > 0) {
    return c.json(
      {
        submissionId: crypto.randomUUID(),
        message: 'Recibimos tu solicitud.',
      },
      201,
    );
  }

  const projectId = c.req.param('projectId')!;
  const repository = new SiteFormsRepository(c.env.DB);
  const published = await repository.getPublishedForProject(projectId);
  if (!published) throw AppError.notFound('Formulario público');

  const definition = parseInput(siteFormDefinitionSchema, published.definition);
  const answers = validatePublishedSiteFormAnswers(definition, input.answers);

  if (c.env.TURNSTILE_DISABLED !== '1') {
    if (!input.turnstileToken) {
      throw new AppError('turnstile_failed', 'Falta la verificación anti-spam.');
    }
    const valid = await verifyTurnstile(
      c.env.TURNSTILE_SECRET_KEY,
      input.turnstileToken,
      c.req.header('CF-Connecting-IP'),
    );
    if (!valid) throw new AppError('turnstile_failed', 'Verificación anti-spam fallida.');
  }

  const created = await repository.createRequest({
    formId: published.formId,
    projectId,
    formRevision: published.revision,
    answers,
    definitionSnapshot: definition,
    internalPayload: {
      source: 'site-form-public-module',
      requestId: c.get('requestId'),
      cfRay: boundedHeader(c.req.header('CF-Ray'), 160),
      country: boundedHeader(c.req.header('CF-IPCountry'), 8),
      referer: boundedHeader(c.req.header('Referer'), 1000),
    },
    ip: boundedHeader(c.req.header('CF-Connecting-IP'), 80),
    userAgent: boundedHeader(c.req.header('User-Agent'), 500),
  });

  // No se exponen estado, respuestas, notas, historial ni payload interno.
  return c.json(
    {
      submissionId: created.id,
      message: definition.successMessage,
    },
    201,
  );
});

async function readBoundedJson(c: {
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
  };
}): Promise<unknown> {
  const declaredLength = Number(c.req.header('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUBLIC_BODY_BYTES) {
    throw new AppError('validation_error', 'La solicitud excede el tamaño permitido.');
  }
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}

function boundedHeader(value: string | undefined, maximum: number): string | null {
  return value ? value.slice(0, maximum) : null;
}
