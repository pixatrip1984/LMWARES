import type { Id, IsoDateTime, Timestamps } from '../common';

export const CUSTOM_DOMAIN_TYPES = ['www', 'app', 'apex'] as const;
export type CustomDomainType = (typeof CUSTOM_DOMAIN_TYPES)[number];

export const CUSTOM_DOMAIN_STATUSES = [
  'draft',
  'pending_verification',
  'verified',
  'provisioning',
  'active',
  'failed',
  'removed',
] as const;
export type CustomDomainStatus = (typeof CUSTOM_DOMAIN_STATUSES)[number];

export const CUSTOM_DOMAIN_VERIFICATION_METHODS = ['cname', 'txt'] as const;
export type CustomDomainVerificationMethod = (typeof CUSTOM_DOMAIN_VERIFICATION_METHODS)[number];

export const CUSTOM_DOMAIN_CERTIFICATE_STATUSES = [
  'not_requested',
  'pending',
  'active',
  'failed',
] as const;
export type CustomDomainCertificateStatus = (typeof CUSTOM_DOMAIN_CERTIFICATE_STATUSES)[number];

/**
 * Dominio personalizado del proyecto Starter. El subdominio administrado por
 * LMWares vive en el proyecto y nunca se reemplaza por este registro.
 */
export interface ClientCustomDomain extends Timestamps {
  id: Id;
  clientProjectId: Id;
  userId: Id;
  hostname: string;
  type: CustomDomainType;
  status: CustomDomainStatus;
  verificationMethod: CustomDomainVerificationMethod;
  dnsInstructions: DomainProviderDnsInstruction[];
  provider: string | null;
  externalId: string | null;
  certificateStatus: CustomDomainCertificateStatus;
  lastError: string | null;
  /**
   * Poblados sólo cuando el hostname se compró y conectó vía un
   * DomainRegistrar (ej. Namesilo) en vez de que el cliente ya lo tuviera.
   */
  registrar: string | null;
  registrarOrderId: string | null;
  verifiedAt: IsoDateTime | null;
  activatedAt: IsoDateTime | null;
  removedAt: IsoDateTime | null;
}

export interface DomainProviderDnsInstruction {
  type: 'CNAME' | 'ALIAS' | 'TXT';
  name: string;
  value: string;
  ttlSeconds: number | null;
}

export interface DomainProviderRegistration {
  provider: string;
  externalId: string | null;
  status: Extract<
    CustomDomainStatus,
    'pending_verification' | 'verified' | 'provisioning' | 'active'
  >;
  instructions: DomainProviderDnsInstruction[];
}

export interface DomainProviderStatus {
  status: Exclude<CustomDomainStatus, 'draft'>;
  certificateStatus: CustomDomainCertificateStatus;
  externalId: string | null;
  error: string | null;
}

/**
 * Boundary for a real DNS/SSL provider. Implementations must not activate a
 * hostname until the caller has verified the required DNS record.
 */
export interface DomainProvider {
  readonly name: string;
  register(input: {
    hostname: string;
    verificationToken: string;
  }): Promise<DomainProviderRegistration>;
  getStatus(input: { hostname: string; externalId: string | null }): Promise<DomainProviderStatus>;
  activate(input: {
    hostname: string;
    externalId: string | null;
    verified: boolean;
  }): Promise<DomainProviderStatus>;
  deactivate(input: { hostname: string; externalId: string | null }): Promise<DomainProviderStatus>;
  remove(input: { hostname: string; externalId: string | null }): Promise<DomainProviderStatus>;
}
