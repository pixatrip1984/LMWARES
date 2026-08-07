import { AppError } from './errors';
import { mapCheckRegistrationReply } from './namesilo-response-parsing';
import type {
  DomainAvailability,
  DomainPurchaseResult,
  DomainRegistrar,
  DomainRegistrarDnsRecord,
} from './models/domain-registrar';

const NAMESILO_API_BASE = 'https://www.namesilo.com/api';
const DEFAULT_TIMEOUT_MS = 12_000;

interface NamesiloDomainRegistrarOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** true fuera de producción para golpear el sandbox de Namesilo en vez de la cuenta real. */
  sandbox?: boolean;
  /**
   * Namesilo bloquea (403) las peticiones que llegan desde IPs de datacenter/cloud,
   * incluyendo las IPs de salida de Cloudflare Workers. Cuando se configura, las
   * peticiones se reenvían a este proxy (p. ej. una función AWS Lambda) en vez de
   * llamar a Namesilo directamente. Ver infra/namesilo-proxy/.
   */
  proxyBaseUrl?: string;
  /** Secreto compartido enviado como header X-Proxy-Secret al proxy. Requerido si se usa proxyBaseUrl. */
  proxySharedSecret?: string;
}

interface NamesiloReply {
  code: string | number;
  detail?: string;
  [key: string]: unknown;
}

interface NamesiloEnvelope {
  request?: unknown;
  reply?: NamesiloReply;
}

/**
 * Adaptador contra la API REST de Namesilo (https://www.namesilo.com/api-reference).
 * Todas las operaciones son GET, autenticadas por API key en la query string
 * (nunca logueada). La API convierte XML a JSON con las inconsistencias
 * típicas de ese tipo de conversión (un solo resultado no siempre llega como
 * arreglo); por eso todo el parseo pasa por `asArray()` y helpers tolerantes.
 *
 * IMPORTANTE: antes de habilitar `DOMAIN_REGISTRAR_PROVIDER=namesilo` en
 * producción, se debe validar esta forma exacta contra el sandbox de Namesilo
 * con un dominio de prueba barato controlado por el negocio (ver
 * docs/domains-runbook.md sección Namesilo).
 */
export class NamesiloDomainRegistrar implements DomainRegistrar {
  readonly name = 'namesilo';

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sandbox: boolean;
  private readonly proxyBaseUrl?: string;
  private readonly proxySharedSecret?: string;

  constructor(options: NamesiloDomainRegistrarOptions) {
    this.apiKey = requireConfig(options.apiKey, 'NAMESILO_API_KEY');
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sandbox = options.sandbox ?? false;
    this.proxyBaseUrl = options.proxyBaseUrl?.replace(/\/+$/, '');
    this.proxySharedSecret = options.proxySharedSecret;

    if (this.proxyBaseUrl && !this.proxySharedSecret) {
      throw new AppError(
        'internal_error',
        'Falta el secreto compartido del proxy del registrador de dominios.',
      );
    }

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000) {
      throw new AppError('internal_error', 'El timeout del registrador de dominios no es válido.');
    }
  }

  async checkAvailability(input: {
    sld: string;
    tlds: readonly string[];
  }): Promise<DomainAvailability[]> {
    const sld = normalizeSld(input.sld);
    const domains = input.tlds.map((tld) => `${sld}.${normalizeTld(tld)}`);
    if (domains.length === 0) {
      throw new AppError('validation_error', 'Debes indicar al menos un TLD a consultar.');
    }
    if (domains.length > 20) {
      throw new AppError('validation_error', 'Demasiados TLDs para una sola consulta.');
    }

    const reply = await this.request(
      'checkRegistration',
      { domains: domains.join(',') },
      'check_availability',
    );

    return mapCheckRegistrationReply(domains, reply);
  }

  async purchase(input: { domain: string; years: 1 }): Promise<DomainPurchaseResult> {
    const domain = normalizeDomain(input.domain);
    const reply = await this.request(
      'registerDomain',
      {
        domain,
        years: String(input.years),
        private: '1',
        auto_renew: '0',
      },
      'purchase',
    );
    const orderId =
      optionalString(reply.order_number) ??
      optionalString(reply.order_id) ??
      optionalString((reply as Record<string, unknown>)['order-id']) ??
      domain;
    return { domain, orderId };
  }

  async setDnsRecords(input: {
    domain: string;
    records: DomainRegistrarDnsRecord[];
  }): Promise<void> {
    const domain = normalizeDomain(input.domain);
    for (const record of input.records) {
      const rrtype = record.type === 'ALIAS' ? 'ALIAS' : record.type;
      const rrhost = record.host === '@' ? '' : record.host;
      await this.request(
        'dnsAddRecord',
        {
          domain,
          rrtype,
          rrhost,
          rrvalue: record.value,
          rrttl: String(Math.max(record.ttlSeconds, 3600)),
        },
        'set_dns_record',
      );
    }
  }

  private async request(
    operation: string,
    params: Record<string, string>,
    logOperation: string,
  ): Promise<NamesiloReply> {
    const apiBase = this.proxyBaseUrl ?? NAMESILO_API_BASE;
    const url = new URL(`${apiBase}/${operation}`);
    url.searchParams.set('version', '1');
    url.searchParams.set('type', 'json');
    url.searchParams.set('key', this.apiKey);
    if (this.sandbox) url.searchParams.set('sandbox', '1');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LMWares-Starter/1.0 (+https://lmwares.com)',
          ...(this.proxySharedSecret ? { 'X-Proxy-Secret': this.proxySharedSecret } : {}),
        },
        signal: controller.signal,
      });
    } catch (fetchError) {
      console.warn('namesilo_registrar_request_failed', {
        operation: logOperation,
        errorName: fetchError instanceof Error ? fetchError.name : typeof fetchError,
        errorMessage: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
      throw new AppError('internal_error', 'El registrador de dominios no respondió a tiempo.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      console.warn('namesilo_registrar_http_error', {
        operation: logOperation,
        status: response.status,
        bodySnippet: bodyText.slice(0, 300),
      });
      throw registrarHttpError(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      console.warn('namesilo_registrar_invalid_json', { operation: logOperation });
      throw new AppError(
        'internal_error',
        'El registrador de dominios devolvió una respuesta inválida.',
      );
    }

    const envelope = parseEnvelope(payload);
    const reply = envelope.reply;
    if (!reply) {
      console.warn('namesilo_registrar_missing_reply', { operation: logOperation });
      throw new AppError(
        'internal_error',
        'El registrador de dominios devolvió una respuesta sin contenido.',
      );
    }
    const code = Number(reply.code);
    // Namesilo usa 300 para éxito y 301 para "éxito con advertencias" en
    // algunas operaciones (ej. dnsAddRecord ya existente).
    if (code !== 300 && code !== 301) {
      console.warn('namesilo_registrar_rejected', { operation: logOperation, code });
      throw new AppError(
        'internal_error',
        `El registrador de dominios rechazó la operación (${reply.detail ?? 'sin detalle'}).`,
      );
    }
    return reply;
  }
}

function parseEnvelope(value: unknown): NamesiloEnvelope {
  if (!isRecord(value)) {
    throw new AppError(
      'internal_error',
      'El registrador de dominios devolvió un formato inesperado.',
    );
  }
  const replyRaw = value.reply;
  return {
    request: value.request,
    reply: isRecord(replyRaw) ? (replyRaw as NamesiloReply) : undefined,
  };
}

/**
 * Namesilo convierte XML a JSON: un único elemento repetido llega como objeto
 * u string suelto en vez de arreglo de un elemento (ver `asArray` en
 * namesilo-response-parsing.ts). `domainNameOf`/`priceCentsOf` se reutilizan
 * desde ese módulo puro cuando hace falta leer un solo dominio (ej. purchase).
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireConfig(value: string, name: string): string {
  const result = value.trim();
  if (!result) {
    throw new AppError('internal_error', `Falta configurar ${name} para el registrador de dominios.`);
  }
  return result;
}

const SLD_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_PATTERN = /^[a-z]{2,}(?:\.[a-z]{2,})?$/;

function normalizeSld(value: string): string {
  const sld = value.trim().toLowerCase();
  if (!SLD_PATTERN.test(sld)) {
    throw new AppError(
      'validation_error',
      'El nombre debe usar sólo letras, números y guiones, sin puntos.',
    );
  }
  return sld;
}

function normalizeTld(value: string): string {
  const tld = value.trim().toLowerCase().replace(/^\./, '');
  if (!TLD_PATTERN.test(tld)) {
    throw new AppError('internal_error', `TLD no soportado: ${value}.`);
  }
  return tld;
}

function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  const labels = domain.split('.');
  if (
    labels.length < 2 ||
    labels.some((label) => !SLD_PATTERN.test(label) && !/^[a-z]{2,}$/.test(label))
  ) {
    throw new AppError('validation_error', 'El dominio no tiene un formato válido.');
  }
  return domain;
}

function registrarHttpError(status: number): AppError {
  if (status === 429) {
    return new AppError(
      'rate_limited',
      'El registrador de dominios está temporalmente limitado. Intenta de nuevo más tarde.',
    );
  }
  return new AppError('internal_error', 'El registrador de dominios rechazó la operación.');
}
