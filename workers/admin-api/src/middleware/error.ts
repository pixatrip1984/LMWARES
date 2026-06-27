import type { Context } from 'hono';
import { AppError } from '@starter/domain';

/** Handler global de errores → contrato ApiErrorBody. */
export function onError(err: Error, c: Context): Response {
  const requestId = c.get('requestId') as string | undefined;
  if (err instanceof AppError) {
    return c.json(err.toBody(requestId), err.status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500);
  }
  console.error('unhandled_error', requestId, err);
  return c.json(
    new AppError('internal_error', 'Error interno del servidor.').toBody(requestId),
    500,
  );
}
