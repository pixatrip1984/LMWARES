import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import { createRequestSchema, parseInput } from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { verifyTurnstile } from '../lib/turnstile';

export const requests = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** POST /requests — recibe una solicitud pública (con Turnstile). */
requests.post('/', async (c) => {
  const raw = await c.req.json().catch(() => {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  });
  const input = parseInput(createRequestSchema, raw);

  // Verificación de Turnstile server-side (saltable solo en local).
  if (c.env.TURNSTILE_DISABLED !== '1') {
    const ip = c.req.header('CF-Connecting-IP');
    const ok = await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, input.turnstileToken, ip);
    if (!ok) throw new AppError('turnstile_failed', 'Verificación anti-spam fallida.');
  }

  const { turnstileToken: _omit, ...data } = input;
  const repos = createRepositories(c.env.DB);
  const created = await repos.requests.create({ ...data, source: 'public-web' });

  await repos.audit.record({
    actorType: 'public',
    action: 'request.create',
    entityType: 'request',
    entityId: created.id,
    metadata: { type: created.type, publicationId: created.publicationId },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });

  return c.json({ id: created.id, status: created.status }, 201);
});
