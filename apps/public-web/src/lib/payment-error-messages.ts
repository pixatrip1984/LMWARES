import { AppError } from '@starter/domain';

/**
 * Mensaje genérico para cualquier error de pago que no sea seguro de mostrar
 * tal cual al cliente (fallas de configuración, flags apagados, tokens
 * faltantes, discrepancias de datos congelados, etc.). Nunca debe filtrarse
 * texto interno/técnico a un cliente final.
 */
export const GENERIC_PAYMENT_ERROR_MESSAGE =
  'Este método de pago no está disponible en este momento. Ya lo estamos revisando; intenta de nuevo en unos minutos o contáctanos si el problema continúa.';

/**
 * Códigos de AppError cuyo mensaje es seguro de mostrar directamente al
 * cliente: son estados de negocio esperables (el proyecto no está listo, el
 * checkout ya venció, etc.), no detalles internos de configuración.
 */
const SAFE_ERROR_CODES = new Set(['conflict', 'validation_error', 'not_found']);

/**
 * Traduce un error de una operación de pago a un mensaje apto para mostrar
 * al cliente. Los errores de negocio (AppError con código "seguro") se
 * muestran tal cual; cualquier otro (fallas de configuración, flags
 * apagados, tokens faltantes, `forbidden`, `internal_error`, `unauthorized`,
 * o errores no reconocidos) cae a un mensaje genérico y profesional.
 */
export function friendlyPaymentErrorMessage(
  error: unknown,
  fallback: string = GENERIC_PAYMENT_ERROR_MESSAGE,
): string {
  if (error instanceof AppError) {
    return SAFE_ERROR_CODES.has(error.code) ? error.message : fallback;
  }
  return fallback;
}
