import type { z } from 'zod';
import { AppError } from '@starter/domain';

/** Convierte un ZodError al mapa campo→mensajes del contrato de la API. */
export function zodErrorToDetails(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_root';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Valida `data` contra `schema` y devuelve el valor tipado (tipo de SALIDA del
 * schema, con `.default()` ya aplicados), o lanza AppError('validation_error').
 */
export function parseInput<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('validation_error', 'Datos inválidos.', zodErrorToDetails(result.error));
  }
  return result.data;
}
