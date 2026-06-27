import type { Context } from 'hono';
import { AppError } from '@starter/domain';

/** Handler global de errores: traduce AppError y desconocidos al contrato JSON. */
export function onError(err: Error, c: Context): Response {
  const requestId = c.get('requestId') as string | undefined;

  if (err instanceof AppError) {
    return c.json(err.toBody(requestId), err.status as 400);
  }

  console.error('unhandled_error', requestId, err);
  const fallback = new AppError('internal_error', 'Error interno del servidor.');
  return c.json(fallback.toBody(requestId), 500);
}
