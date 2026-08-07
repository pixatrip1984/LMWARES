import {
  AppError,
  NamesiloDomainRegistrar,
  PorkbunDomainRegistrar,
  type DomainRegistrar,
} from '@starter/domain';
import type { Bindings } from '../env';

type DomainRegistrarConfig = Pick<
  Bindings,
  | 'DOMAIN_REGISTRAR_PROVIDER'
  | 'NAMESILO_API_KEY'
  | 'NAMESILO_PROXY_BASE_URL'
  | 'NAMESILO_PROXY_SHARED_SECRET'
  | 'PORKBUN_API_KEY'
  | 'PORKBUN_SECRET_API_KEY'
>;

/**
 * Registrador de dominios inerte: no hay compra "manual" real (comprar un
 * dominio siempre requiere un proveedor real), así que este stub existe sólo
 * para mantener el mismo patrón de gate que `createStarterDomainProvider` y
 * fallar con un mensaje claro mientras `DOMAIN_REGISTRAR_PROVIDER=manual`
 * (el default seguro: sin este flag no se hacen llamadas externas ni se
 * generan cargos).
 */
class DisabledDomainRegistrar implements DomainRegistrar {
  readonly name = 'manual';

  async checkAvailability(): Promise<never> {
    throw new AppError(
      'conflict',
      'La búsqueda de dominios propios todavía no está habilitada para este entorno.',
    );
  }

  async purchase(): Promise<never> {
    throw new AppError(
      'conflict',
      'La compra de dominios propios todavía no está habilitada para este entorno.',
    );
  }

  async setDnsRecords(): Promise<never> {
    throw new AppError(
      'conflict',
      'La configuración de DNS de dominios propios todavía no está habilitada para este entorno.',
    );
  }
}

/**
 * Mismo patrón que `createStarterDomainProvider`: el flujo de compra de
 * dominios ("domain-search-purchase-flow") debe llamar esta factory en cada
 * request en vez de instanciar `NamesiloDomainRegistrar` directamente, para
 * que el gate `DOMAIN_REGISTRAR_PROVIDER` sea la única forma de habilitarlo.
 */
export function createDomainRegistrar(env: DomainRegistrarConfig): DomainRegistrar {
  const providerName = (env.DOMAIN_REGISTRAR_PROVIDER ?? 'manual').trim().toLowerCase();

  if (providerName === 'manual' || providerName === '') {
    return new DisabledDomainRegistrar();
  }

  if (providerName === 'namesilo') {
    const apiKey = env.NAMESILO_API_KEY?.trim();
    if (!apiKey) {
      throw new AppError(
        'internal_error',
        'El registrador de dominios Namesilo no está configurado para este entorno.',
      );
    }
    const proxyBaseUrl = env.NAMESILO_PROXY_BASE_URL?.trim() || undefined;
    const proxySharedSecret = env.NAMESILO_PROXY_SHARED_SECRET?.trim() || undefined;
    return new NamesiloDomainRegistrar({ apiKey, proxyBaseUrl, proxySharedSecret });
  }

  if (providerName === 'porkbun') {
    const apiKey = env.PORKBUN_API_KEY?.trim();
    const secretApiKey = env.PORKBUN_SECRET_API_KEY?.trim();
    if (!apiKey || !secretApiKey) {
      throw new AppError(
        'internal_error',
        'El registrador de dominios Porkbun no está configurado para este entorno.',
      );
    }
    return new PorkbunDomainRegistrar({ apiKey, secretApiKey });
  }

  throw new AppError('internal_error', 'La configuración del registrador de dominios no es válida.');
}
