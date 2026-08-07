import { Hono } from 'hono';
import { AppError, CloudflareSaasDomainProvider } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';

export const starterDomainsAdmin = new Hono<{ Bindings: Bindings; Variables: Variables }>();

starterDomainsAdmin.get('/', async (c) => {
  const clientProjectId = c.req.query('clientProjectId')?.trim() || undefined;
  const domains = await createRepositories(c.env.DB).lmwaresCustomDomains.listForAdmin(
    clientProjectId,
  );
  c.header('Cache-Control', 'no-store');
  return c.json({
    domains: domains.map(publicCustomDomain),
    filters: { clientProjectId: clientProjectId ?? null },
  });
});

starterDomainsAdmin.post('/:domainId/verify', requireWrite, async (c) => {
  const admin = c.get('admin');
  const domainId = c.req.param('domainId');
  if (!domainId) throw AppError.notFound('Dominio personalizado');
  const repos = createRepositories(c.env.DB);
  const domain = await repos.lmwaresCustomDomains.getById(domainId);
  if (!domain) throw AppError.notFound('Dominio personalizado');
  let verified = domain;
  if (domain.provider === 'manual-cname' || !domain.provider) {
    verified = await repos.lmwaresCustomDomains.confirmVerifiedByAdmin(domain.id);
  } else {
    const provider = createCloudflareProvider(c.env, domain.provider);
    const providerStatus = await provider.getStatus({
      hostname: domain.hostname,
      externalId: domain.externalId,
    });
    if (providerStatus.status === 'removed') {
      throw new AppError('conflict', 'El proveedor ya retiró este hostname.');
    }
    verified = await repos.lmwaresCustomDomains.saveProviderStatus({
      id: domain.id,
      status: providerStatus.status,
      certificateStatus: providerStatus.certificateStatus,
      externalId: providerStatus.externalId,
      error: providerStatus.error,
    });
    if (providerStatus.status === 'pending_verification') {
      throw new AppError('conflict', 'Cloudflare todavía no confirmó la propiedad del hostname.');
    }
    if (providerStatus.status === 'failed') {
      throw new AppError(
        'conflict',
        'Cloudflare no pudo verificar o emitir el certificado del hostname.',
      );
    }
  }
  await repos.audit.record({
    actorType: 'admin',
    actorId: admin.id,
    action: 'lmwares.custom_domain.admin_verify',
    entityType: 'lmw_custom_domain',
    entityId: verified.id,
    metadata: {
      clientProjectId: verified.clientProjectId,
      hostname: verified.hostname,
      status: verified.status,
    },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
  return c.json({ domain: publicCustomDomain(verified) });
});

starterDomainsAdmin.delete('/:domainId', requireWrite, async (c) => {
  const admin = c.get('admin');
  const domainId = c.req.param('domainId');
  if (!domainId) throw AppError.notFound('Dominio personalizado');
  const repos = createRepositories(c.env.DB);
  const domain = await repos.lmwaresCustomDomains.getById(domainId);
  if (!domain) throw AppError.notFound('Dominio personalizado');
  if (domain.provider && domain.provider !== 'manual-cname') {
    const provider = createCloudflareProvider(c.env, domain.provider);
    await provider.remove({
      hostname: domain.hostname,
      externalId: domain.externalId,
    });
  }
  const removed = await repos.lmwaresCustomDomains.remove({
    id: domain.id,
    userId: domain.userId,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: admin.id,
    action: 'lmwares.custom_domain.admin_remove',
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

function publicCustomDomain(domain: {
  id: string;
  clientProjectId: string;
  hostname: string;
  type: string;
  status: string;
  verificationMethod: string;
  dnsInstructions: unknown;
  provider: string | null;
  externalId: string | null;
  certificateStatus: string;
  lastError: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: domain.id,
    clientProjectId: domain.clientProjectId,
    hostname: domain.hostname,
    type: domain.type,
    status: domain.status,
    verificationMethod: domain.verificationMethod,
    dnsInstructions: domain.dnsInstructions,
    provider: domain.provider,
    externalId: domain.externalId,
    certificateStatus: domain.certificateStatus,
    lastError: domain.lastError,
    verifiedAt: domain.verifiedAt,
    activatedAt: domain.activatedAt,
    removedAt: domain.removedAt,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
  };
}

function createCloudflareProvider(
  env: Pick<
    Bindings,
    'CLOUDFLARE_SAAS_API_TOKEN' | 'CLOUDFLARE_ZONE_ID' | 'CLOUDFLARE_SAAS_CNAME_TARGET'
  >,
  providerName: string,
) {
  if (providerName !== 'cloudflare-saas') {
    throw new AppError('internal_error', 'El proveedor del dominio no está soportado.');
  }
  const apiToken = env.CLOUDFLARE_SAAS_API_TOKEN?.trim();
  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim();
  if (!apiToken || !zoneId) {
    throw new AppError(
      'internal_error',
      'El proveedor Cloudflare no está configurado para este entorno.',
    );
  }
  return new CloudflareSaasDomainProvider({
    apiToken,
    zoneId,
    cnameTarget: env.CLOUDFLARE_SAAS_CNAME_TARGET,
  });
}
