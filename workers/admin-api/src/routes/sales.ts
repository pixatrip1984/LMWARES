import { Hono } from 'hono';
import { z } from 'zod';
import { createRepositories } from '@starter/db';
import { AppError } from '@starter/domain';
import {
  estimateCommercialPackage,
  maintenancePlanTierAmountCents,
  type MaintenancePlanTier,
  type PaidPackageModuleId,
} from '@starter/domain';
import type { Bindings, Variables } from '../env';
import { draftSalesScope } from '../lib/sales-scope-agent';
import { COMMERCIAL_SCOPE_POLICY } from '@starter/domain';

export const sales = new Hono<{ Bindings: Bindings; Variables: Variables }>();

sales.use('/operations/:id/generate-scope', async (c, next) => {
  const startedAt = Date.now();
  await next();
  console.info(JSON.stringify({ event: 'sales.scope.request_finished', operationId: c.req.param('id'), requestId: c.get('requestId'), status: c.res.status, errorCode: c.error instanceof AppError ? c.error.code : undefined, elapsedMs: Date.now() - startedAt }));
});

const createDraftSchema = z
  .object({
    contact: z.object({
      displayName: z.string().trim().min(1).max(160),
      email: z.string().trim().email().max(320),
    }),
    business: z
      .object({
        tradeName: z.string().trim().min(1).max(200),
        legalName: z.string().trim().min(1).max(200).nullable().optional(),
      })
      .nullable()
      .optional(),
    requirementBrief: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const dedupSchema = z
  .object({
    email: z.string().trim().email().max(320).optional(),
    businessName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
const updateDraftSchema = z
  .object({
    rowVersion: z.number().int().positive(),
    requirementBrief: z.record(z.string(), z.unknown()),
  })
  .strict();

sales.get('/operations', async (c) => {
  const operations = await createRepositories(
    c.env.DB,
  ).lmwaresCommercialOperations.listForSalesActor(c.get('salesActor').id);
  return c.json({ operations });
});

sales.get('/operations/:id', async (c) => {
  const operation = await createRepositories(c.env.DB).lmwaresCommercialOperations.getForSalesActor(
    c.req.param('id')!,
    c.get('salesActor').id,
  );
  if (!operation) throw AppError.notFound('Operación comercial');
  return c.json({ operation });
});

sales.patch('/operations/:id', async (c) => {
  const input = updateDraftSchema.parse(await readJson(c));
  const operation = await createRepositories(
    c.env.DB,
  ).lmwaresCommercialOperations.updateDraftForSalesActor({
    operationId: c.req.param('id')!,
    salesActorId: c.get('salesActor').id,
    rowVersion: input.rowVersion,
    requirementBrief: input.requirementBrief,
  });
  return c.json({ operation });
});

sales.post('/operations/dedup-hints', async (c) => {
  const input = dedupSchema.parse(await readJson(c));
  const hints = await createRepositories(c.env.DB).lmwaresCommercialOperations.findDedupHints(
    input,
  );
  return c.json({ hints });
});

sales.post('/operations', async (c) => {
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new AppError('validation_error', 'Incluye una clave de idempotencia válida.');
  }
  const raw = await readJson(c);
  const input = createDraftSchema.parse(raw);
  const seller = c.get('salesActor');
  const operation = await createRepositories(c.env.DB).lmwaresCommercialOperations.createDraft({
    originChannel: 'seller_assisted',
    createdByActorId: seller.id,
    contact: input.contact,
    business: input.business,
    requirementBrief: input.requirementBrief,
    idempotency: {
      actorScope: `seller:${seller.id}`,
      key: idempotencyKey,
      requestDigest: await digestCanonicalJson(input),
    },
  });
  return c.json({ operation }, 201);
});

sales.get('/operations/:id/scope', async (c) => {
  const scope = await createRepositories(c.env.DB).lmwaresCommercialOperations.getScopeForSalesActor(c.req.param('id')!, c.get('salesActor').id);
  if (!scope) throw AppError.notFound('Alcance');
  return c.json(scope);
});

sales.post('/operations/:id/generate-scope', async (c) => {
  const repos = createRepositories(c.env.DB);
  const seller = c.get('salesActor');
  const operation = await repos.lmwaresCommercialOperations.getForSalesActor(
    c.req.param('id')!,
    seller.id,
  );
  if (!operation) throw AppError.notFound('Operación comercial');
  if (!['draft', 'needs_scope', 'offer_ready'].includes(operation.status)) throw new AppError('conflict', 'Esta operación ya no admite generar alcance.');
  if (operation.status === 'offer_ready' && operation.currentProposalId) {
    const existing = await repos.lmwaresCommercialOperations.getScopeForSalesActor(operation.id, seller.id);
    if (existing) return c.json({ proposal: { id: existing.id, version: existing.version, operation }, draft: existing.draft });
  }
  const brief = operation.requirementBrief as Record<string, unknown>;
  const selection = brief.packageSelection as Record<string, unknown> | undefined;
  const plan = selection?.plan;
  const modules = selection?.modules;
  const maintenancePreference = selection?.maintenancePreference;
  const businessName = typeof brief.businessName === 'string' ? brief.businessName : null;
  const notes = typeof brief.sellerNotes === 'string' ? brief.sellerNotes : '';
  if (
    (plan !== 'starter' && plan !== 'pro') ||
    !Array.isArray(modules) ||
    !businessName ||
    !['later', 'none', 'basic', 'advanced'].includes(String(maintenancePreference))
  )
    throw new AppError(
      'validation_error',
      'Completa negocio, paquete, módulos y mantenimiento antes de generar el alcance.',
    );
  const selectedModules = modules.filter(
    (x): x is PaidPackageModuleId => typeof x === 'string',
  ) as PaidPackageModuleId[];
  const estimate = estimateCommercialPackage({ plan, modules: selectedModules, marketing: false });
  const monthlyAmountCents =
    maintenancePreference === 'basic' || maintenancePreference === 'advanced'
      ? maintenancePlanTierAmountCents(maintenancePreference as MaintenancePlanTier)
      : 0;
  const draft = await draftSalesScope(c.env, {
    businessName,
    notes,
    plan,
    modules: selectedModules,
    maintenancePreference: maintenancePreference as 'later' | 'none' | 'basic' | 'advanced',
  });
  const renderedDocument = JSON.stringify({
    schema: 'lmwares.sales.scope-draft.v1',
    businessName,
    plan,
    modules,
    ...draft,
  });
  const proposal = await repos.lmwaresCommercialOperations.saveScopeProposalForSalesActor({
    expectedRowVersion: operation.rowVersion,
    operationId: operation.id,
    salesActorId: seller.id,
    renderedDocument,
    documentDigest: await digestCanonicalJson(JSON.parse(renderedDocument)),
    scopeSnapshot: draft as unknown as Record<string, unknown>,
    pricingSnapshot: {
      implementationAmountCents: estimate.implementationAmountCents,
      monthlyAmountCents,
      currency: 'MXN',
      pricingVersion: estimate.pricingVersion,
      maintenancePreference,
    },
    termsSnapshot: { status: 'not_presented' },
    policySnapshot: { model: 'deepseek-v4-flash', policyVersion: COMMERCIAL_SCOPE_POLICY, plan, modules: selectedModules },
  });
  return c.json({ proposal, draft });
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}

async function digestCanonicalJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
