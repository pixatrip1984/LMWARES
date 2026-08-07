/**
 * Namesilo convierte XML a JSON con las inconsistencias típicas de ese tipo
 * de conversión (un solo resultado no siempre llega como arreglo de un
 * elemento). Estas funciones puras normalizan esa respuesta y no dependen de
 * red ni de ningún otro módulo, por lo que se prueban de forma aislada.
 */

export interface NamesiloDomainAvailability {
  domain: string;
  available: boolean;
  priceCents: number | null;
}

export function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    const domainField = value.domain;
    if (domainField !== undefined) return asArray(domainField);
  }
  return [value];
}

export function domainNameOf(entry: unknown): string {
  if (typeof entry === 'string') return entry.trim().toLowerCase();
  if (isRecord(entry)) {
    const text = entry['#text'] ?? entry.domain ?? entry.value;
    if (typeof text === 'string') return text.trim().toLowerCase();
  }
  return '';
}

export function priceCentsOf(entry: unknown): number | null {
  if (!isRecord(entry)) return null;
  const raw = entry.price ?? entry['@price'] ?? entry['@_price'];
  if (raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

/**
 * Combina la lista de dominios consultados con la respuesta cruda de
 * `checkRegistration` (`reply.available`/`reply.unavailable`/`reply.invalid`)
 * en un resultado uniforme, uno por dominio consultado.
 */
export function mapCheckRegistrationReply(
  domains: string[],
  reply: Record<string, unknown>,
): NamesiloDomainAvailability[] {
  const available = new Set(
    asArray(reply.available).map((entry) => domainNameOf(entry)).filter(Boolean),
  );
  const unavailable = new Set(
    asArray(reply.unavailable).map((entry) => domainNameOf(entry)).filter(Boolean),
  );
  const invalid = new Set(
    asArray(reply.invalid).map((entry) => domainNameOf(entry)).filter(Boolean),
  );
  const priceByDomain = new Map<string, number | null>();
  for (const entry of asArray(reply.available)) {
    const domain = domainNameOf(entry);
    if (domain) priceByDomain.set(domain, priceCentsOf(entry));
  }

  return domains.map((domain) => {
    if (invalid.has(domain)) {
      return { domain, available: false, priceCents: null };
    }
    if (available.has(domain)) {
      return { domain, available: true, priceCents: priceByDomain.get(domain) ?? null };
    }
    // Cubre tanto "unavailable" explícito como cualquier dominio que el
    // registrador no haya clasificado: nunca asumimos disponibilidad.
    return { domain, available: false, priceCents: null };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
