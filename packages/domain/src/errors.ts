/**
 * Errores de dominio con código estable. Los Workers los traducen a HTTP
 * y el api-client los reconstruye en el frontend.
 */
export const ERROR_CODES = [
  'validation_error',
  'not_found',
  'unauthorized',
  'forbidden',
  'conflict',
  'rate_limited',
  'turnstile_failed',
  'internal_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Forma estándar del cuerpo de error que devuelven las APIs. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Detalles de validación campo→mensajes, opcional. */
    details?: Record<string, string[]>;
    /** Id de correlación para rastrear en logs. */
    requestId?: string;
  };
}

const HTTP_BY_CODE: Record<ErrorCode, number> = {
  validation_error: 422,
  not_found: 404,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
  rate_limited: 429,
  turnstile_failed: 400,
  internal_error: 500,
};

/** Error de aplicación con código de dominio y status HTTP asociado. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_BY_CODE[code];
    this.details = details;
  }

  toBody(requestId?: string): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  static notFound(resource = 'Recurso') {
    return new AppError('not_found', `${resource} no encontrado.`);
  }

  static unauthorized(message = 'No autenticado.') {
    return new AppError('unauthorized', message);
  }

  static forbidden(message = 'No autorizado.') {
    return new AppError('forbidden', message);
  }
}

export function httpStatusForCode(code: ErrorCode): number {
  return HTTP_BY_CODE[code];
}
