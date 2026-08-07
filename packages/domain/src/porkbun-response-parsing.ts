/**
 * Funciones puras de parseo/normalización para el adaptador Porkbun,
 * separadas en un archivo sin imports locales para poder probarlas
 * directamente con `node --experimental-strip-types --test` (mismo patrón
 * que `namesilo-response-parsing.ts`).
 */

export interface PorkbunAvailabilityLike {
  avail?: string;
  price?: string;
  [key: string]: unknown;
}

/** Porkbun devuelve el precio en USD como string decimal, ej. "10.98". */
export function priceCentsOf(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SLD_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_PATTERN = /^[a-z]{2,}(?:\.[a-z]{2,})?$/;

export function normalizeSld(value: string): string {
  const sld = value.trim().toLowerCase();
  if (!SLD_PATTERN.test(sld)) {
    throw new Error('El nombre debe usar sólo letras, números y guiones, sin puntos.');
  }
  return sld;
}

export function normalizeTld(value: string): string {
  const tld = value.trim().toLowerCase().replace(/^\./, '');
  if (!TLD_PATTERN.test(tld)) {
    throw new Error(`TLD no soportado: ${value}.`);
  }
  return tld;
}

export function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  const labels = domain.split('.');
  if (
    labels.length < 2 ||
    labels.some((label) => !SLD_PATTERN.test(label) && !/^[a-z]{2,}$/.test(label))
  ) {
    throw new Error('El dominio no tiene un formato válido.');
  }
  return domain;
}
