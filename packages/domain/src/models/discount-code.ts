import type { Id, IsoDateTime, Timestamps } from '../common';
import type { PaidPackagePlan } from './package-payment';

/** Porcentajes de descuento permitidos para las promociones del cotizador. */
export const DISCOUNT_PERCENTS = [5, 10, 15] as const;
export type DiscountPercent = (typeof DISCOUNT_PERCENTS)[number];

export const DISCOUNT_CODE_STATUSES = [
  'active',
  'disabled',
  'exhausted',
  'expired',
] as const;
export type DiscountCodeStatus = (typeof DISCOUNT_CODE_STATUSES)[number];

/**
 * Código de descuento promocional. Aplica un porcentaje fijo (5/10/15%) sobre
 * el importe de implementación de un paquete Starter o Pro. La expiración es
 * por tiempo (`expiresAt`) o por cantidad (`maxRedemptions`), nunca ambas a la
 * vez: el operador elige una política al crearlo.
 */
export interface DiscountCode extends Timestamps {
  id: Id;
  /** Código normalizado (mayúsculas, sin espacios) que el cliente teclea. */
  code: string;
  discountPercent: DiscountPercent;
  /** Plan al que aplica. `null` = válido para Starter y Pro. */
  plan: PaidPackagePlan | null;
  status: DiscountCodeStatus;
  /** Límite de usos. `null` = sin límite por cantidad (solo expira por tiempo). */
  maxRedemptions: number | null;
  redemptionCount: number;
  /** Payload canónico para generar el QR (URL de promoción). */
  qrData: string | null;
  /** Expiración por tiempo. `null` = sin expiración por tiempo. */
  expiresAt: IsoDateTime | null;
  createdBy: string;
}

/** Registro inmutable de cada uso de un código de descuento. */
export interface DiscountRedemption extends Timestamps {
  id: Id;
  discountCodeId: Id;
  intakeId: Id | null;
  userId: Id;
  discountPercent: DiscountPercent;
  originalCents: number;
  discountedCents: number;
  currency: 'MXN';
  redeemedAt: IsoDateTime;
}

/** Resultado de validar/aplicar un código contra un importe de implementación. */
export interface DiscountApplication {
  code: string;
  discountPercent: DiscountPercent;
  originalCents: number;
  discountedCents: number;
  discountCents: number;
  currency: 'MXN';
}
