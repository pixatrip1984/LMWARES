import type {
  DomainProvider,
  DomainProviderRegistration,
  DomainProviderStatus,
} from './models/custom-domain';

/**
 * Provider used before a DNS/SSL vendor is selected. It only emits the records
 * an operator must create and never performs a network request.
 */
export class ManualCnameDomainProvider implements DomainProvider {
  readonly name = 'manual-cname';
  private readonly cnameTarget: string;

  constructor(cnameTarget: string) {
    if (!cnameTarget.trim()) {
      throw new Error('ManualCnameDomainProvider requiere un destino CNAME.');
    }
    this.cnameTarget = cnameTarget;
  }

  async register(input: {
    hostname: string;
    verificationToken: string;
  }): Promise<DomainProviderRegistration> {
    return {
      provider: this.name,
      externalId: null,
      status: 'pending_verification',
      instructions: [
        {
          type: 'CNAME',
          name: input.hostname,
          value: this.cnameTarget,
          ttlSeconds: 300,
        },
        {
          type: 'TXT',
          name: `_lmwares-verify.${input.hostname}`,
          value: `lmwares-domain-verification=${input.verificationToken}`,
          ttlSeconds: 300,
        },
      ],
    };
  }

  async getStatus(): Promise<DomainProviderStatus> {
    return {
      status: 'pending_verification',
      certificateStatus: 'not_requested',
      externalId: null,
      error: null,
    };
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
        externalId: null,
        error: `El dominio ${input.hostname} aún no fue verificado.`,
      };
    }
    return {
      status: 'provisioning',
      certificateStatus: 'pending',
      externalId: input.externalId,
      error: null,
    };
  }

  async deactivate(input: {
    hostname: string;
    externalId: string | null;
  }): Promise<DomainProviderStatus> {
    return {
      status: 'failed',
      certificateStatus: 'not_requested',
      externalId: input.externalId,
      error: `La desactivación de ${input.hostname} requiere confirmación del proveedor.`,
    };
  }

  async remove(input: {
    hostname: string;
    externalId: string | null;
  }): Promise<DomainProviderStatus> {
    return {
      status: 'removed',
      certificateStatus: 'not_requested',
      externalId: input.externalId,
      error: `El dominio ${input.hostname} conserva sus registros DNS hasta que un operador los retire.`,
    };
  }
}
