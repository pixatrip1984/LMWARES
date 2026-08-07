import { AppError } from './errors';
import {
  isRecord,
  normalizeDomain,
  normalizeSld,
  normalizeTld,
  priceCentsOf,
} from './porkbun-response-parsing';
import type {
  DomainAvailability,
  DomainPurchaseResult,
  DomainRegistrar,
  DomainRegistrarDnsRecord,
} from './models/domain-registrar';

const PORKBUN_API_BASE = 'https://api.porkbun.com/api/json/v3';
const DEFAULT_TIMEOUT_MS = 12_000;
/**
 * Porkbun limita /domain/checkDomain a 1 consulta cada 10s por API key
 * (default; ver `limits`/`ttlRemaining` en la respuesta). Espaciamos las
 * llamadas secuenciales un poco por encima del mínimo documentado para
 * evitar fallar por relojes ligeramente desalineados.
 */
const CHECK_DOMAIN_MIN_INTERVAL_MS = 10_500;
const RATE_LIMIT_RETRY_WAIT_MS = 11_000;

interface PorkbunDomainRegistrarOptions {
  apiKey: string;
  secretApiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface PorkbunCheckDomainResponse {
  status: string;
  response?: {
    avail?: string;
    price?: string;
    regularPrice?: string;
    premium?: string;
    [key: string]: unknown;
  };
  message?: string;
  code?: string;
}

interface PorkbunCreateDomainResponse {
  status: string;
  domain?: string;
  cost?: number;
  orderId?: number;
  message?: string;
  code?: string;
}

interface PorkbunBasicResponse {
  status: string;
  message?: string;
  code?: string;
}

/**
 * Adaptador contra la API REST/JSON de Porkbun (https://porkbun.com/api/json/v3/documentation).
 * Se eligió Porkbun tras descartar Namesilo: Namesilo bloquea (403) las IPs de
 * salida de Cloudflare Workers, requiriendo un proxy externo (ver historial en
 * infra/namesilo-proxy/, ya no usado). Porkbun no impone esa restricción y no
 * requiere datos fiscales de empresa para operar la API, sólo tarjeta de pago.
 *
 * Todas las operaciones son POST con JSON body, autenticadas con dos claves
 * (`apikey`/`secretapikey`) enviadas en el body (nunca logueadas). Porkbun
 * ofrece un modo sandbox real (keys con prefijo `pk1_sb_`/`sk1_sb_`) que
 * simula todo sin cargos ni cambios reales — usar ese modo para validar antes
 * de habilitar `DOMAIN_REGISTRAR_PROVIDER=porkbun` contra la cuenta real.
 */
export class PorkbunDomainRegistrar implements DomainRegistrar {
  readonly name = 'porkbun';

  private readonly apiKey: string;
  private readonly secretApiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: PorkbunDomainRegistrarOptions) {
    this.apiKey = requireConfig(options.apiKey, 'PORKBUN_API_KEY');
    this.secretApiKey = requireConfig(options.secretApiKey, 'PORKBUN_SECRET_API_KEY');
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000) {
      throw new AppError('internal_error', 'El timeout del registrador de dominios no es válido.');
    }
  }

  async checkAvailability(input: {
    sld: string;
    tlds: readonly string[];
  }): Promise<DomainAvailability[]> {
    let sld: string;
    try {
      sld = normalizeSld(input.sld);
    } catch (error) {
      throw new AppError('validation_error', errorMessage(error));
    }

    const domains: string[] = [];
    for (const tld of input.tlds) {
      try {
        domains.push(`${sld}.${normalizeTld(tld)}`);
      } catch (error) {
        throw new AppError('internal_error', errorMessage(error));
      }
    }
    if (domains.length === 0) {
      throw new AppError('validation_error', 'Debes indicar al menos un TLD a consultar.');
    }
    if (domains.length > 20) {
      throw new AppError('validation_error', 'Demasiados TLDs para una sola consulta.');
    }

    const results: DomainAvailability[] = [];
    let lastCheckDomainAt: number | null = null;
    for (const domain of domains) {
      if (lastCheckDomainAt !== null) {
        const elapsed = Date.now() - lastCheckDomainAt;
        const waitMs = CHECK_DOMAIN_MIN_INTERVAL_MS - elapsed;
        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }
      lastCheckDomainAt = Date.now();

      const payload = await this.request<PorkbunCheckDomainResponse>(
        `/domain/checkDomain/${encodeURIComponent(domain)}`,
        {},
        'check_availability',
      );
      const response = payload.response;
      const available = response?.avail === 'yes';
      const priceCents = available ? priceCentsOf(response?.price) : null;
      results.push({ domain, available, priceCents });
    }
    return results;
  }

  async purchase(input: { domain: string; years: 1 }): Promise<DomainPurchaseResult> {
    let domain: string;
    try {
      domain = normalizeDomain(input.domain);
    } catch (error) {
      throw new AppError('validation_error', errorMessage(error));
    }

    const check = await this.request<PorkbunCheckDomainResponse>(
      `/domain/checkDomain/${encodeURIComponent(domain)}`,
      {},
      'purchase_price_check',
    );
    if (check.response?.avail !== 'yes') {
      throw new AppError('conflict', 'El dominio ya no está disponible para registro.');
    }
    const priceCents = priceCentsOf(check.response.price);
    if (priceCents === null) {
      throw new AppError(
        'internal_error',
        'El registrador de dominios no devolvió un precio válido para este dominio.',
      );
    }

    const reply = await this.request<PorkbunCreateDomainResponse>(
      `/domain/create/${encodeURIComponent(domain)}`,
      {
        // Porkbun documenta `cost` como entero en centavos (pennies), no dólares.
        cost: priceCents,
        agreeToTerms: 'yes',
      },
      'purchase',
    );

    const orderId = reply.orderId != null ? String(reply.orderId) : domain;
    return { domain: reply.domain ?? domain, orderId };
  }

  async setDnsRecords(input: {
    domain: string;
    records: DomainRegistrarDnsRecord[];
  }): Promise<void> {
    let domain: string;
    try {
      domain = normalizeDomain(input.domain);
    } catch (error) {
      throw new AppError('validation_error', errorMessage(error));
    }

    for (const record of input.records) {
      const name = record.host === '@' ? '' : record.host;
      await this.request<PorkbunBasicResponse>(
        `/dns/create/${encodeURIComponent(domain)}`,
        {
          name,
          type: record.type,
          content: record.value,
          ttl: Math.max(record.ttlSeconds, 600),
        },
        'set_dns_record',
      );
    }
  }

  private async request<T extends { status: string; message?: string; code?: string }>(
    path: string,
    body: Record<string, unknown>,
    logOperation: string,
    attempt = 1,
  ): Promise<T> {
    const url = `${PORKBUN_API_BASE}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'LMWares-Starter/1.0 (+https://lmwares.com)',
        },
        body: JSON.stringify({
          apikey: this.apiKey,
          secretapikey: this.secretApiKey,
          ...body,
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      console.warn('porkbun_registrar_request_failed', {
        operation: logOperation,
        errorName: fetchError instanceof Error ? fetchError.name : typeof fetchError,
        errorMessage: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
      throw new AppError('internal_error', 'El registrador de dominios no respondió a tiempo.');
    } finally {
      clearTimeout(timeoutId);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      console.warn('porkbun_registrar_invalid_json', {
        operation: logOperation,
        status: response.status,
      });
      throw new AppError(
        'internal_error',
        'El registrador de dominios devolvió una respuesta inválida.',
      );
    }

    if (!isRecord(payload) || typeof payload.status !== 'string') {
      console.warn('porkbun_registrar_unexpected_shape', { operation: logOperation });
      throw new AppError(
        'internal_error',
        'El registrador de dominios devolvió un formato inesperado.',
      );
    }

    const typed = payload as unknown as T;
    if (typed.status.toUpperCase() !== 'SUCCESS') {
      // Porkbun limita checkDomain (y otras escrituras) a 1 intento cada 10s
      // por API key. Si nos toparon con ese límite, reintentamos una sola vez
      // en vez de fallarle la búsqueda al usuario por una carrera de timing.
      if (attempt === 1 && isRateLimited(response.status, typed)) {
        console.warn('porkbun_registrar_rate_limited_retry', { operation: logOperation });
        await sleep(RATE_LIMIT_RETRY_WAIT_MS);
        return this.request<T>(path, body, logOperation, attempt + 1);
      }

      console.warn('porkbun_registrar_rejected', {
        operation: logOperation,
        status: response.status,
        code: typed.code,
        message: typed.message,
      });
      throw registrarRejectedError(response.status, typed.message);
    }

    return typed;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(
  status: number,
  typed: { code?: string; message?: string },
): boolean {
  if (status === 429) return true;
  if (typed.code === 'RATE_LIMIT_EXCEEDED') return true;
  const message = typed.message?.toLowerCase() ?? '';
  return message.includes('checks within') || message.includes('rate limit');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireConfig(value: string, name: string): string {
  const result = value.trim();
  if (!result) {
    throw new AppError('internal_error', `Falta configurar ${name} para el registrador de dominios.`);
  }
  return result;
}

function registrarRejectedError(status: number, message: string | undefined): AppError {
  if (status === 429) {
    return new AppError(
      'rate_limited',
      'El registrador de dominios está temporalmente limitado. Intenta de nuevo más tarde.',
    );
  }
  return new AppError(
    'internal_error',
    `El registrador de dominios rechazó la operación (${message ?? 'sin detalle'}).`,
  );
}
