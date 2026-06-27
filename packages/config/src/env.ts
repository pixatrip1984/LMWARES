/**
 * Helpers para leer variables de entorno / bindings de Workers de forma
 * tipada. Lanzan temprano si falta una variable requerida (fail fast).
 */
export function requireString(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Falta la variable de entorno requerida: ${key}`);
  }
  return value;
}

export function optionalString(
  env: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = env[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function optionalBool(
  env: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const value = env[key];
  if (typeof value !== 'string') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

/** Parsea una lista separada por comas (p.ej. orígenes CORS permitidos). */
export function parseList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
