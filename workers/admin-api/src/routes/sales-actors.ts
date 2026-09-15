import { Hono } from 'hono';
import { z } from 'zod';
import { createRepositories } from '@starter/db';
import { AppError } from '@starter/domain';
import type { Bindings, Variables } from '../env';
import { requireApproval } from '../middleware/auth';

export const salesActorsAdmin = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

const createSalesActorSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().min(1).max(160),
  accessSubject: z.string().trim().min(1).max(500).optional(),
});

const updateSalesActorStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'revoked']),
});

salesActorsAdmin.get('/', requireApproval, async (c) => {
  const actors = await createRepositories(c.env.DB).lmwaresCommercialOperations.listSalesActors();
  return c.json({ actors });
});

salesActorsAdmin.post('/', requireApproval, async (c) => {
  const input = createSalesActorSchema.parse(await readJson(c));
  const repos = createRepositories(c.env.DB);
  const actor = await repos.lmwaresCommercialOperations.syncSalesActor(input);
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.sales_actor.provisioned',
    entityType: 'lmwares_sales_actor',
    entityId: actor.id,
    metadata: { email: actor.emailNormalized, status: actor.status },
  });
  return c.json({ actor }, 201);
});

salesActorsAdmin.patch('/:id/status', requireApproval, async (c) => {
  const input = updateSalesActorStatusSchema.parse(await readJson(c));
  const repos = createRepositories(c.env.DB);
  const actor = await repos.lmwaresCommercialOperations.setSalesActorStatus({
    id: c.req.param('id')!,
    status: input.status,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: `lmwares.sales_actor.${input.status}`,
    entityType: 'lmwares_sales_actor',
    entityId: actor.id,
    metadata: { email: actor.emailNormalized, status: actor.status },
  });
  return c.json({ actor });
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
