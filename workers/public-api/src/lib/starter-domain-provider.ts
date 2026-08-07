import {
  AppError,
  CloudflareSaasDomainProvider,
  ManualCnameDomainProvider,
  type DomainProvider,
} from '@starter/domain';
import type { Bindings } from '../env';

type DomainProviderConfig = Pick<
  Bindings,
  | 'DOMAIN_PROVIDER'
  | 'STARTER_DOMAIN_CNAME_TARGET'
  | 'CLOUDFLARE_SAAS_API_TOKEN'
  | 'CLOUDFLARE_ZONE_ID'
  | 'CLOUDFLARE_SAAS_CNAME_TARGET'
>;

/**
 * Keeps manual domains as the safe default and lets existing records select
 * their original provider when the global feature flag changes later.
 */
export function createStarterDomainProvider(
  env: DomainProviderConfig,
  requestedProvider?: string | null,
): DomainProvider {
  const providerName = (requestedProvider ?? env.DOMAIN_PROVIDER ?? 'manual').trim().toLowerCase();

  if (providerName === 'manual' || providerName === 'manual-cname') {
    const cnameTarget = env.STARTER_DOMAIN_CNAME_TARGET?.trim();
    if (!cnameTarget) {
      throw new AppError(
        'conflict',
        'El registro de dominios personalizados todavía no está habilitado.',
      );
    }
    return new ManualCnameDomainProvider(cnameTarget);
  }

  if (providerName === 'cloudflare-saas') {
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

  throw new AppError('internal_error', 'La configuración del proveedor de dominios no es válida.');
}
