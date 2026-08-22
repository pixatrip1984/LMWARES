import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  createDiscountCodeSchema,
  parseInput,
  updateDiscountCodeStatusSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';

export const discountCodesAdmin = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

discountCodesAdmin.get('/', async (c) => {
  const codes = await createRepositories(c.env.DB).lmwaresDiscountCodes.list();
  return c.json({ codes });
});

discountCodesAdmin.post('/', requireWrite, async (c) => {
  const input = parseInput(createDiscountCodeSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const code = await repos.lmwaresDiscountCodes.create({
    code: input.code,
    discountPercent: input.discountPercent,
    plan: input.plan ?? null,
    maxRedemptions: input.maxRedemptions ?? null,
    qrData: input.qrData ?? null,
    expiresAt: input.expiresAt ?? null,
    createdBy: c.get('admin').email,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.discount_code.create',
    entityType: 'lmw_discount_code',
    entityId: code.id,
    metadata: {
      code: code.code,
      discountPercent: code.discountPercent,
      plan: code.plan,
      maxRedemptions: code.maxRedemptions,
      expiresAt: code.expiresAt,
    },
  });
  return c.json({ code }, 201);
});

discountCodesAdmin.patch('/:id/status', requireWrite, async (c) => {
  const input = parseInput(updateDiscountCodeStatusSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const code = await repos.lmwaresDiscountCodes.setStatus(c.req.param('id')!, input.status);
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: `lmwares.discount_code.${input.status}`,
    entityType: 'lmw_discount_code',
    entityId: code.id,
    metadata: { code: code.code, status: code.status },
  });
  return c.json({ code });
});

discountCodesAdmin.delete('/:id', requireWrite, async (c) => {
  const repos = createRepositories(c.env.DB);
  await repos.lmwaresDiscountCodes.delete(c.req.param('id')!);
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.discount_code.delete',
    entityType: 'lmw_discount_code',
    entityId: c.req.param('id')!,
    metadata: {},
  });
  return c.json({ ok: true });
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
