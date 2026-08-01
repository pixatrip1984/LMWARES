import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import { listPackageIntakesSchema, parseInput, reviewPackageIntakeSchema } from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';

export const commercialIntakesAdmin = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

commercialIntakesAdmin.get('/', async (c) => {
  const input = parseInput(listPackageIntakesSchema, {
    status: c.req.query('status') || undefined,
    limit: c.req.query('limit') || undefined,
  });
  const intakes = await createRepositories(c.env.DB).lmwaresPackageIntakes.listForReview(input);
  return c.json({ intakes });
});

commercialIntakesAdmin.get('/:id', async (c) => {
  const intake = await createRepositories(c.env.DB).lmwaresPackageIntakes.getById(c.req.param('id'));
  if (!intake) throw AppError.notFound('Solicitud comercial');
  return c.json({ intake });
});

commercialIntakesAdmin.patch('/:id/review', requireWrite, async (c) => {
  const input = parseInput(reviewPackageIntakeSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const intake = await repos.lmwaresPackageIntakes.review({
    id: c.req.param('id')!,
    status: input.status,
    reviewedBy: c.get('admin').email,
    notes: input.notes ?? null,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: `lmwares.package_intake.${input.status}`,
    entityType: 'lmwares_package_intake',
    entityId: intake.id,
    metadata: { status: intake.status, maintenanceStartPolicy: intake.maintenanceStartPolicy },
  });
  return c.json({ intake });
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
