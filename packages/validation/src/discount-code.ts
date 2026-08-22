import { z } from 'zod';
import { PAID_PACKAGE_PLANS } from '@starter/domain';

const discountCodeValue = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))
  .refine((value) => /^[A-Z0-9_-]+$/.test(value), {
    message: 'El código solo puede contener letras, números, guiones y guiones bajos.',
  });

/**
 * Política de expiración: exactamente una de las dos (tiempo o cantidad).
 * El operador elige `expiresAt` (ISO datetime) o `maxRedemptions` (entero > 0).
 */
const expiryPolicy = z
  .object({
    expiresAt: z.string().datetime({ offset: true }).nullish(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullish(),
  })
  .refine((value) => (value.expiresAt == null) !== (value.maxRedemptions == null), {
    message: 'Elige expiración por tiempo o por cantidad, no ambas.',
  });

export const createDiscountCodeSchema = z
  .object({
    code: discountCodeValue,
    discountPercent: z.union([
      z.literal(5),
      z.literal(10),
      z.literal(15),
    ]),
    plan: z.enum(PAID_PACKAGE_PLANS).nullish(),
    qrData: z.string().trim().max(2_000).nullish(),
  })
  .and(expiryPolicy);

export type CreateDiscountCodeInput = z.infer<typeof createDiscountCodeSchema>;

export const updateDiscountCodeStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

export type UpdateDiscountCodeStatusInput = z.infer<typeof updateDiscountCodeStatusSchema>;

/** Validación pública de un código contra un plan e importe (vista previa). */
export const previewDiscountCodeSchema = z.object({
  code: discountCodeValue,
  plan: z.enum(PAID_PACKAGE_PLANS),
  originalCents: z.number().int().min(1).max(100_000_000),
});

export type PreviewDiscountCodeInput = z.infer<typeof previewDiscountCodeSchema>;
