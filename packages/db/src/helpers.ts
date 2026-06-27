import type { Metadata } from '@starter/domain';

/** Genera un UUID v4. Disponible en Workers vía Web Crypto. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Timestamp ISO-8601 UTC actual. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Parsea JSON de una columna TEXT con fallback seguro. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function parseMetadata(value: string | null | undefined): Metadata {
  return parseJson<Metadata>(value, {});
}

/** D1 guarda booleanos como 0/1. */
export function boolFromDb(value: number | null | undefined): boolean {
  return value === 1;
}

export function boolToDb(value: boolean): number {
  return value ? 1 : 0;
}

/** Normaliza undefined → null para bindings de D1. */
export function nullable<T>(value: T | undefined | null): T | null {
  return value == null ? null : value;
}
