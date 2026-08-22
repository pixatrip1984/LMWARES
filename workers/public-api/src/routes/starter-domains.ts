import { Hono } from 'hono';
import {
  AppError,
  DOMAIN_REGISTRAR_TLDS,
  toRegistrarDnsRecords,
  type ClientCustomDomain,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  createCustomDomainSchema,
  domainPurchaseSchema,
  domainSearchSchema,
  parseInput,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { randomBase64Url, sha256Hex } from '../lib/auth-crypto';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';
import { createStarterDomainProvider } from '../lib/starter-domain-provider';
import { createDomainRegistrar } from '../lib/domain-registrar-factory';

export const starterDomains = new Hono<{ Bindings: Bindings; Variables: Variables }>();

starterDomains.get('/:clientProjectId/domains', async (c) => {
  const session = await requirePublicSession(c);
  const domains = await createRepositories(c.env.DB).lmwaresCustomDomains.listForClientProject({
    clientProjectId: c.req.param('clientProjectId'),
    userId: session.user.id,
  });
  c.header('Cache-Control', 'no-store');
  return c.json({ domains: domains.map(publicCustomDomain) });
});

starterDomains.post('/:clientProjectId/domains', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const input = parseInput(createCustomDomainSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const clientProject = await repos.lmwaresStarterClientProjects.getById(
    c.req.param('clientProjectId'),
  );
  if (!clientProject || clientProject.userId !== session.user.id) {
    throw AppError.notFound('Proyecto Starter');
  }
  const workOrder = await repos.lmwaresStarterWorkOrders.getById(clientProject.workOrderId);
  if (!workOrder || !['ready_to_publish', 'live'].includes(workOrder.status)) {
    throw new AppError(
      'conflict',
      'El dominio personalizado estará disponible cuando la entrega esté lista para publicar.',
    );
  }
  const existingDomains = await repos.lmwaresCustomDomains.listForClientProject({
    clientProjectId: c.req.param('clientProjectId'),
    userId: session.user.id,
  });
  const existingType = existingDomains.find(
    (domain) => domain.type === input.type && domain.status !== 'removed',
  );
  if (existingType) {
    if (existingType.hostname !== input.hostname) {
      throw new AppError(
        'conflict',
        `El proyecto ya tiene un dominio ${input.type} pendiente o activo.`,
      );
    }
    return c.json({
      domain: publicCustomDomain(existingType),
      verification: null,
    });
  }

  const verificationToken = randomBase64Url(24);
  const provider = createStarterDomainProvider(c.env);
  const registration = await provider.register({
    hostname: input.hostname,
    verificationToken,
  });
  const result = await repos.lmwaresCustomDomains.createPendingWithResult({
    clientProjectId: c.req.param('clientProjectId'),
    userId: session.user.id,
    hostname: input.hostname,
    type: input.type,
    verificationMethod: 'txt',
    verificationTokenHash: await sha256Hex(verificationToken),
    dnsInstructions: registration.instructions,
    provider: registration.provider,
    externalId: registration.externalId,
  });

  if (result.created) {
    await repos.audit.record({
      actorType: 'public',
      actorId: session.user.id,
      action: 'lmwares.custom_domain.create',
      entityType: 'lmw_custom_domain',
      entityId: result.domain.id,
      metadata: {
        clientProjectId: result.domain.clientProjectId,
        hostname: result.domain.hostname,
        type: result.domain.type,
        provider: result.domain.provider,
      },
      ip: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
    });
  }

  return c.json(
    {
      domain: publicCustomDomain(result.domain),
      verification: result.created
        ? {
            token: verificationToken,
            instructions: registration.instructions,
            expires: null,
            oneTime: true,
          }
        : null,
    },
    result.created ? 201 : 200,
  );
});

starterDomains.delete('/:clientProjectId/domains/:domainId', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const repos = createRepositories(c.env.DB);
  const domain = await repos.lmwaresCustomDomains.getById(c.req.param('domainId'));
  if (
    !domain ||
    domain.clientProjectId !== c.req.param('clientProjectId') ||
    domain.userId !== session.user.id
  ) {
    throw AppError.notFound('Dominio personalizado');
  }
  if (domain.provider && domain.provider !== 'manual-cname') {
    const provider = createStarterDomainProvider(c.env, domain.provider);
    await provider.remove({
      hostname: domain.hostname,
      externalId: domain.externalId,
    });
  }
  const removed = await repos.lmwaresCustomDomains.remove({
    id: domain.id,
    userId: session.user.id,
  });
  await repos.audit.record({
    actorType: 'public',
    actorId: session.user.id,
    action: 'lmwares.custom_domain.remove',
    entityType: 'lmw_custom_domain',
    entityId: removed.id,
    metadata: {
      clientProjectId: removed.clientProjectId,
      hostname: removed.hostname,
    },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
  return c.json({ domain: publicCustomDomain(removed) });
});

/**
 * El dominio incluido sólo se registra cuando el cliente autorizó el plan
 * Básico o Avanzado. Un dominio que ya compró el cliente usa la ruta de
 * conexión manual y no pasa por esta compuerta.
 */
async function requireActiveMaintenance(
  repos: ReturnType<typeof createRepositories>,
  clientProjectId: string,
  userId: string,
): Promise<void> {
  const clientProject = await repos.lmwaresStarterClientProjects.getById(clientProjectId);
  if (!clientProject || clientProject.userId !== userId) {
    throw AppError.notFound('Proyecto Starter');
  }
  const workOrder = await repos.lmwaresStarterWorkOrders.getById(clientProject.workOrderId);
  if (!workOrder || !['ready_to_publish', 'live'].includes(workOrder.status)) {
    throw new AppError(
      'conflict',
      'El dominio propio estará disponible cuando la entrega esté lista para publicar.',
    );
  }
  const offer = await repos.lmwaresCommercialOffers.getById(workOrder.commercialOfferId);
  if (!offer || !['basic', 'advanced'].includes(offer.maintenancePlanSelected ?? '')) {
    throw new AppError(
      'conflict',
      'El dominio incluido requiere Mantenimiento Básico o Avanzado.',
    );
  }
  const subscription = await repos.lmwaresMaintenanceSubscriptions.getByWorkOrderId(workOrder.id);
  if (subscription?.status !== 'active') {
    throw new AppError(
      'conflict',
      'Autoriza la mensualidad de mantenimiento antes de registrar el dominio incluido.',
    );
  }
}

starterDomains.post('/:clientProjectId/domains/search', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const clientProjectId = c.req.param('clientProjectId') ?? '';
  const input = parseInput(domainSearchSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  await requireActiveMaintenance(repos, clientProjectId, session.user.id);

  const registrar = createDomainRegistrar(c.env);
  const results = await registrar.checkAvailability({
    sld: input.sld,
    tlds: DOMAIN_REGISTRAR_TLDS,
  });
  c.header('Cache-Control', 'no-store');
  return c.json({ results });
});

starterDomains.post('/:clientProjectId/domains/purchase', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const clientProjectId = c.req.param('clientProjectId') ?? '';
  const input = parseInput(domainPurchaseSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  await requireActiveMaintenance(repos, clientProjectId, session.user.id);
  const existingDomains = await repos.lmwaresCustomDomains.listForClientProject({
    clientProjectId,
    userId: session.user.id,
  });
  const existingApex = existingDomains.find((domain) => domain.type === 'apex' && domain.status !== 'removed');
  if (existingApex) {
    if (existingApex.hostname !== input.domain!) {
      throw new AppError('conflict', 'El proyecto ya tiene un dominio propio pendiente o activo.');
    }
    return c.json({ domain: publicCustomDomain(existingApex), verification: null });
  }
  const takenElsewhere = await repos.lmwaresCustomDomains.getByHostname(input.domain!);
  if (takenElsewhere && takenElsewhere.status !== 'removed') {
    throw new AppError('conflict', 'Ese dominio ya está asociado a otro proyecto.');
  }

  const registrar = createDomainRegistrar(c.env);
  const purchase = await registrar.purchase({ domain: input.domain!, years: 1 });

  const verificationToken = randomBase64Url(24);
  const provider = createStarterDomainProvider(c.env);
  const registration = await provider.register({
    hostname: input.domain!,
    verificationToken,
  });
  await registrar.setDnsRecords({
    domain: input.domain!,
    records: toRegistrarDnsRecords(input.domain, registration.instructions),
  });

  const result = await repos.lmwaresCustomDomains.createPendingWithResult({
    clientProjectId,
    userId: session.user.id,
    hostname: input.domain!,
    type: 'apex',
    verificationMethod: 'txt',
    verificationTokenHash: await sha256Hex(verificationToken),
    dnsInstructions: registration.instructions,
    provider: registration.provider,
    externalId: registration.externalId,
    registrar: registrar.name,
    registrarOrderId: purchase.orderId,
  });

  if (result.created) {
    await repos.audit.record({
      actorType: 'public',
      actorId: session.user.id,
      action: 'lmwares.custom_domain.namesilo_purchase',
      entityType: 'lmw_custom_domain',
      entityId: result.domain.id,
      metadata: {
        clientProjectId: result.domain.clientProjectId,
        hostname: result.domain.hostname,
        registrar: registrar.name,
        registrarOrderId: purchase.orderId,
      },
      ip: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
    });
  }

  return c.json(
    {
      domain: publicCustomDomain(result.domain),
      verification: result.created
        ? {
            token: verificationToken,
            instructions: registration.instructions,
            expires: null,
            oneTime: true,
          }
        : null,
    },
    result.created ? 201 : 200,
  );
});

function publicCustomDomain(domain: ClientCustomDomain) {
  return {
    id: domain.id,
    clientProjectId: domain.clientProjectId,
    hostname: domain.hostname,
    type: domain.type,
    status: domain.status,
    verificationMethod: domain.verificationMethod,
    dnsInstructions: domain.dnsInstructions,
    provider: domain.provider,
    certificateStatus: domain.certificateStatus,
    lastError: domain.lastError,
    verifiedAt: domain.verifiedAt,
    activatedAt: domain.activatedAt,
    removedAt: domain.removedAt,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
  };
}

async function readJson(c: Parameters<typeof requirePublicSession>[0]): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
