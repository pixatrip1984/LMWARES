import { AppError } from './errors';
import type {
  DomainProvider,
  DomainProviderDnsInstruction,
  DomainProviderRegistration,
  DomainProviderStatus,
} from './models/custom-domain';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const DEFAULT_TIMEOUT_MS = 10_000;

const CLOUDFLARE_HOST_STATUSES = new Set([
  'pending',
  'active',
  'moved',
  'blocked',
  'deleted',
  'pending_deletion',
  'pending_validation',
  'pending_deployment',
  'pending_blocked',
  'pending_cleanup',
  'pending_expiration',
  'pending_limit',
  'pending_migration',
  'pending_provisioned',
  'provisioned',
]);

const CLOUDFLARE_SSL_STATUSES = new Set([
  'initializing',
  'pending',
  'pending_validation',
  'pending_issuance',
  'pending_deployment',
  'active',
  'pending_deletion',
  'pending_expiration',
  'expired',
  'deleted',
  'initializing_timed_out',
  'validation_timed_out',
  'issuance_timed_out',
  'deployment_timed_out',
  'deletion_timed_out',
  'pending_cleanup',
  'staging_deployment',
  'staging_active',
  'deactivating',
  'inactive',
  'backup_issued',
  'holding_deployment',
  'failed',
]);

const CLOUDFLARE_FAILED_SSL_STATUSES = new Set([
  'expired',
  'deleted',
  'deactivating',
  'inactive',
  'initializing_timed_out',
  'validation_timed_out',
  'issuance_timed_out',
  'deployment_timed_out',
  'deletion_timed_out',
  'pending_cleanup',
  'failed',
]);

interface CloudflareSaasDomainProviderOptions {
  apiToken: string;
  zoneId: string;
  cnameTarget?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface CloudflareEnvelope {
  success: boolean;
  errors: unknown[];
  result: unknown;
}

interface CloudflareValidationRecord {
  cname: string | null;
  cnameTarget: string | null;
  txtName: string | null;
  txtValue: string | null;
}

interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status: string;
  ownershipVerification: {
    name: string;
    type: 'TXT';
    value: string;
  } | null;
  ssl: {
    status: string | null;
    validationRecords: CloudflareValidationRecord[];
    hasValidationErrors: boolean;
  } | null;
}

/**
 * Cloudflare for SaaS adapter. It owns only the Custom Hostname resource;
 * customer DNS remains outside this Worker unless Namesilo is enabled later.
 */
export class CloudflareSaasDomainProvider implements DomainProvider {
  readonly name = 'cloudflare-saas';

  private readonly apiToken: string;
  private readonly zoneId: string;
  private readonly cnameTarget: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: CloudflareSaasDomainProviderOptions) {
    this.apiToken = requireConfig(options.apiToken, 'CLOUDFLARE_SAAS_API_TOKEN');
    this.zoneId = requireConfig(options.zoneId, 'CLOUDFLARE_ZONE_ID');
    this.cnameTarget = optionalHostname(options.cnameTarget);
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000) {
      throw new AppError('internal_error', 'El timeout del proveedor de dominios no es válido.');
    }
  }

  async register(input: {
    hostname: string;
    verificationToken: string;
  }): Promise<DomainProviderRegistration> {
    const cnameTarget = this.cnameTarget;
    if (!cnameTarget) {
      throw new AppError(
        'conflict',
        'El proveedor Cloudflare está habilitado pero no tiene un destino CNAME configurado.',
      );
    }
    if (!input.hostname.trim() || !input.verificationToken.trim()) {
      throw new AppError(
        'validation_error',
        'El dominio y su token de verificación son obligatorios.',
      );
    }

    // Reconcile against an existing Custom Hostname before creating a new
    // one. If a prior attempt timed out after Cloudflare already created the
    // resource (response lost in transit), this adopts it instead of
    // creating a duplicate/orphaned hostname at the provider.
    const reconciled = await this.findByHostname(input.hostname);
    const customHostname =
      reconciled ??
      (await this.requestCustomHostname(
        `/zones/${encodeURIComponent(this.zoneId)}/custom_hostnames`,
        {
          method: 'POST',
          body: JSON.stringify({
            hostname: input.hostname,
            ssl: {
              method: 'txt',
              type: 'dv',
            },
          }),
        },
        'register',
      ));
    const providerStatus = mapCloudflareStatus(customHostname);
    if (providerStatus.status === 'failed' || providerStatus.status === 'removed') {
      throw new AppError(
        'internal_error',
        'Cloudflare rechazó el hostname personalizado durante el registro.',
      );
    }

    return {
      provider: this.name,
      externalId: customHostname.id,
      status: providerStatus.status,
      instructions: buildDnsInstructions({
        hostname: input.hostname,
        verificationToken: input.verificationToken,
        cnameTarget,
        customHostname,
      }),
    };
  }

  async getStatus(input: {
    hostname: string;
    externalId: string | null;
  }): Promise<DomainProviderStatus> {
    if (!input.externalId) {
      return {
        status: 'failed',
        certificateStatus: 'not_requested',
        externalId: null,
        error: 'cloudflare_missing_external_id',
      };
    }

    const response = await this.request(
      `/zones/${encodeURIComponent(this.zoneId)}/custom_hostnames/${encodeURIComponent(input.externalId)}`,
      { method: 'GET' },
      'get_status',
      { allowNotFound: true },
    );
    if (response.status === 404) {
      return {
        status: 'removed',
        certificateStatus: 'not_requested',
        externalId: input.externalId,
        error: null,
      };
    }
    const customHostname = parseCustomHostname(
      parseObject(response.payload.result, 'custom_hostname'),
    );
    if (customHostname.hostname.toLowerCase() !== input.hostname.toLowerCase()) {
      return {
        status: 'failed',
        certificateStatus: 'failed',
        externalId: customHostname.id,
        error: 'cloudflare_hostname_mismatch',
      };
    }
    return mapCloudflareStatus(customHostname);
  }

  async activate(input: {
    hostname: string;
    externalId: string | null;
    verified: boolean;
  }): Promise<DomainProviderStatus> {
    if (!input.verified) {
      return {
        status: 'failed',
        certificateStatus: 'not_requested',
        externalId: input.externalId,
        error: 'domain_not_verified',
      };
    }
    return this.getStatus({
      hostname: input.hostname,
      externalId: input.externalId,
    });
  }

  async deactivate(input: {
    hostname: string;
    externalId: string | null;
  }): Promise<DomainProviderStatus> {
    return this.deleteCustomHostname(input, 'deactivate');
  }

  async remove(input: {
    hostname: string;
    externalId: string | null;
  }): Promise<DomainProviderStatus> {
    return this.deleteCustomHostname(input, 'remove');
  }

  private async deleteCustomHostname(
    input: { hostname: string; externalId: string | null },
    operation: 'deactivate' | 'remove',
  ): Promise<DomainProviderStatus> {
    if (!input.externalId) {
      return {
        status: 'removed',
        certificateStatus: 'not_requested',
        externalId: null,
        error: null,
      };
    }

    const response = await this.request(
      `/zones/${encodeURIComponent(this.zoneId)}/custom_hostnames/${encodeURIComponent(input.externalId)}`,
      { method: 'DELETE' },
      operation,
      { allowNotFound: true },
    );
    if (response.status === 404) {
      return {
        status: 'removed',
        certificateStatus: 'not_requested',
        externalId: input.externalId,
        error: null,
      };
    }

    return {
      status: 'removed',
      certificateStatus: 'not_requested',
      externalId: input.externalId,
      error: null,
    };
  }

  private async findByHostname(hostname: string): Promise<CloudflareCustomHostname | null> {
    const response = await this.request(
      `/zones/${encodeURIComponent(this.zoneId)}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
      { method: 'GET' },
      'find_by_hostname',
      { allowNotFound: true },
    );
    if (response.status === 404 || !Array.isArray(response.payload.result)) return null;
    const match = response.payload.result.find(
      (entry) => parseObject(entry, 'custom_hostname').hostname === hostname,
    );
    return match ? parseCustomHostname(parseObject(match, 'custom_hostname')) : null;
  }

  private async requestCustomHostname(
    path: string,
    init: RequestInit,
    operation: string,
  ): Promise<CloudflareCustomHostname> {
    const response = await this.request(path, init, operation);
    const result = parseObject(response.payload.result, 'custom_hostname');
    return parseCustomHostname(result);
  }

  private async request(
    path: string,
    init: RequestInit,
    operation: string,
    options: { allowNotFound?: boolean } = {},
  ): Promise<{ status: number; payload: CloudflareEnvelope }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${CLOUDFLARE_API_BASE}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'lmwares-public-api/1.0 (+https://lmwares.com)',
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch {
      console.warn('cloudflare_domain_provider_request_failed', { operation });
      throw new AppError('internal_error', 'El proveedor de dominios no respondió a tiempo.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (options.allowNotFound && response.status === 404) {
      return {
        status: response.status,
        payload: { success: false, errors: [], result: null },
      };
    }
    if (!response.ok) {
      console.warn('cloudflare_domain_provider_http_error', {
        operation,
        status: response.status,
        cfRay: response.headers.get('cf-ray'),
      });
      throw providerHttpError(response.status);
    }
    if (response.status === 204) {
      return {
        status: response.status,
        payload: { success: true, errors: [], result: null },
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      console.warn('cloudflare_domain_provider_invalid_json', { operation });
      throw new AppError(
        'internal_error',
        'El proveedor de dominios devolvió una respuesta inválida.',
      );
    }
    if (!isCloudflareEnvelope(payload) || !payload.success) {
      console.warn('cloudflare_domain_provider_rejected', { operation });
      throw providerHttpError(response.status);
    }
    return { status: response.status, payload };
  }
}

function buildDnsInstructions(input: {
  hostname: string;
  verificationToken: string;
  cnameTarget: string;
  customHostname: CloudflareCustomHostname;
}): DomainProviderDnsInstruction[] {
  const instructions: DomainProviderDnsInstruction[] = [];
  const add = (instruction: DomainProviderDnsInstruction) => {
    if (
      !instructions.some(
        (current) =>
          current.type === instruction.type &&
          current.name === instruction.name &&
          current.value === instruction.value,
      )
    ) {
      instructions.push(instruction);
    }
  };

  add({
    type: 'CNAME',
    name: input.hostname,
    value: input.cnameTarget,
    ttlSeconds: 300,
  });
  add({
    type: 'TXT',
    name: `_lmwares-verify.${input.hostname}`,
    value: `lmwares-domain-verification=${input.verificationToken}`,
    ttlSeconds: 300,
  });

  const ownership = input.customHostname.ownershipVerification;
  if (ownership) {
    add({
      type: ownership.type,
      name: ownership.name,
      value: ownership.value,
      ttlSeconds: 300,
    });
  }

  for (const record of input.customHostname.ssl?.validationRecords ?? []) {
    if (record.txtName && record.txtValue) {
      add({
        type: 'TXT',
        name: record.txtName,
        value: record.txtValue,
        ttlSeconds: 300,
      });
    }
    if (record.cname && record.cnameTarget) {
      add({
        type: 'CNAME',
        name: record.cname,
        value: record.cnameTarget,
        ttlSeconds: 300,
      });
    }
  }
  return instructions;
}

function mapCloudflareStatus(customHostname: CloudflareCustomHostname): DomainProviderStatus {
  const hostnameStatus = customHostname.status;
  const sslStatus = customHostname.ssl?.status;
  const externalId = customHostname.id;

  if (!CLOUDFLARE_HOST_STATUSES.has(hostnameStatus)) {
    return {
      status: 'failed',
      certificateStatus: certificateStatusFor(sslStatus),
      externalId,
      error: `cloudflare_unknown_hostname_status_${diagnostic(hostnameStatus)}`,
    };
  }
  if (sslStatus && !CLOUDFLARE_SSL_STATUSES.has(sslStatus)) {
    return {
      status: 'failed',
      certificateStatus: 'failed',
      externalId,
      error: `cloudflare_unknown_ssl_status_${diagnostic(sslStatus)}`,
    };
  }
  if (
    hostnameStatus === 'deleted' ||
    hostnameStatus === 'pending_deletion' ||
    hostnameStatus === 'pending_cleanup'
  ) {
    return {
      status: 'removed',
      certificateStatus: certificateStatusFor(sslStatus),
      externalId,
      error: null,
    };
  }
  if (
    hostnameStatus === 'moved' ||
    hostnameStatus === 'blocked' ||
    hostnameStatus === 'pending_blocked' ||
    hostnameStatus === 'pending_expiration' ||
    hostnameStatus === 'pending_limit' ||
    customHostname.ssl?.hasValidationErrors ||
    (sslStatus !== null && sslStatus !== undefined && CLOUDFLARE_FAILED_SSL_STATUSES.has(sslStatus))
  ) {
    return {
      status: 'failed',
      certificateStatus: certificateStatusFor(sslStatus),
      externalId,
      error:
        hostnameStatus === 'moved' ||
        hostnameStatus === 'blocked' ||
        hostnameStatus === 'pending_blocked'
          ? `cloudflare_hostname_${hostnameStatus}`
          : `cloudflare_ssl_${diagnostic(sslStatus ?? 'unknown')}`,
    };
  }
  if (hostnameStatus === 'active' && sslStatus === 'active') {
    return {
      status: 'active',
      certificateStatus: 'active',
      externalId,
      error: null,
    };
  }
  if (hostnameStatus === 'active') {
    return {
      status: 'provisioning',
      certificateStatus: certificateStatusFor(sslStatus),
      externalId,
      error: null,
    };
  }
  if (
    hostnameStatus === 'pending_deployment' ||
    hostnameStatus === 'pending_migration' ||
    hostnameStatus === 'pending_provisioned'
  ) {
    return {
      status: 'provisioning',
      certificateStatus: certificateStatusFor(sslStatus),
      externalId,
      error: null,
    };
  }
  return {
    status: 'pending_verification',
    certificateStatus: certificateStatusFor(sslStatus),
    externalId,
    error: null,
  };
}

function certificateStatusFor(
  sslStatus: string | null | undefined,
): DomainProviderStatus['certificateStatus'] {
  if (!sslStatus) return 'not_requested';
  if (sslStatus === 'active') return 'active';
  if (CLOUDFLARE_FAILED_SSL_STATUSES.has(sslStatus)) {
    return 'failed';
  }
  return 'pending';
}

function parseCustomHostname(value: Record<string, unknown>): CloudflareCustomHostname {
  const id = requiredString(value, 'id');
  const hostname = requiredString(value, 'hostname');
  const status = requiredString(value, 'status').toLowerCase();
  const ownershipRaw = optionalRecord(value.ownership_verification);
  const ownershipName = ownershipRaw ? optionalString(ownershipRaw.name) : null;
  const ownershipValue = ownershipRaw ? optionalString(ownershipRaw.value) : null;
  const ownershipType = ownershipRaw ? optionalString(ownershipRaw.type)?.toUpperCase() : null;
  const ownershipVerification =
    ownershipName && ownershipValue && ownershipType === 'TXT'
      ? { name: ownershipName, type: 'TXT' as const, value: ownershipValue }
      : null;

  const sslRaw = optionalRecord(value.ssl);
  const sslStatus = sslRaw ? (optionalString(sslRaw.status)?.toLowerCase() ?? null) : null;
  const validationRecords = sslRaw ? parseValidationRecords(sslRaw.validation_records) : [];
  const hasValidationErrors =
    sslRaw && Array.isArray(sslRaw.validation_errors) && sslRaw.validation_errors.length > 0;

  return {
    id,
    hostname,
    status,
    ownershipVerification,
    ssl: sslRaw
      ? {
          status: sslStatus,
          validationRecords,
          hasValidationErrors: Boolean(hasValidationErrors),
        }
      : null,
  };
}

function parseValidationRecords(value: unknown): CloudflareValidationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    if (!record) return [];
    return [
      {
        cname: optionalString(record.cname),
        cnameTarget: optionalString(record.cname_target),
        txtName: optionalString(record.txt_name),
        txtValue: optionalString(record.txt_value),
      },
    ];
  });
}

function parseObject(value: unknown, resource: string): Record<string, unknown> {
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw new AppError('internal_error', `Cloudflare devolvió un ${resource} inválido.`);
  }
  return parsed;
}

function isCloudflareEnvelope(value: unknown): value is CloudflareEnvelope {
  return (
    isRecord(value) &&
    typeof value.success === 'boolean' &&
    Array.isArray(value.errors) &&
    'result' in value
  );
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = optionalString(value[key]);
  if (!result) {
    throw new AppError('internal_error', 'Cloudflare devolvió datos incompletos.');
  }
  return result;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireConfig(value: string, name: string): string {
  const result = value.trim();
  if (!result) {
    throw new AppError('internal_error', `Falta configurar ${name} para el proveedor de dominios.`);
  }
  return result;
}

function optionalHostname(value: string | undefined): string | null {
  const result = value?.trim().toLowerCase() ?? '';
  if (!result) return null;
  if (
    result.includes('/') ||
    result.includes(':') ||
    result.includes('?') ||
    result.includes('#') ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      result,
    )
  ) {
    throw new AppError('internal_error', 'El destino CNAME del proveedor no es válido.');
  }
  return result;
}

function providerHttpError(status: number): AppError {
  if (status === 429) {
    return new AppError(
      'rate_limited',
      'El proveedor de dominios está temporalmente limitado. Intenta de nuevo más tarde.',
    );
  }
  return new AppError('internal_error', 'El proveedor de dominios rechazó la operación.');
}

function diagnostic(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return normalized.slice(0, 48) || 'unknown';
}
