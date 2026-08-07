import { z } from 'zod';
import {
  IMPLEMENTATION_MINIMUM_TOTAL_AMOUNT_CENTS,
  MAINTENANCE_PLAN_TIERS,
  PACKAGE_MODULE_IDS,
  PAID_PACKAGE_PLANS,
} from '@starter/domain';

export const issueCommercialOfferSchema = z.object({
  plan: z.enum(PAID_PACKAGE_PLANS),
  modules: z.array(z.enum(PACKAGE_MODULE_IDS)).min(2).max(PACKAGE_MODULE_IDS.length),
  marketing: z.boolean(),
  implementationAmountCents: z
    .number()
    .int()
    .min(IMPLEMENTATION_MINIMUM_TOTAL_AMOUNT_CENTS)
    .max(100_000_000),
  monthlyAmountCents: z.number().int().min(0).max(10_000_000),
  scopeSummary: z.string().trim().min(20).max(4_000),
  implementationDescription: z.string().trim().min(20).max(4_000),
  recurringDescription: z.string().trim().min(20).max(4_000),
  validUntil: z.string().datetime({ offset: true }),
});

export type IssueCommercialOfferInput = z.infer<typeof issueCommercialOfferSchema>;

export const acceptCommercialOfferSchema = z.object({
  accepted: z.literal(true),
  termsVersion: z.string().trim().min(1).max(80),
});

export type AcceptCommercialOfferInput = z.infer<typeof acceptCommercialOfferSchema>;

export const selectMaintenancePlanSchema = z.object({
  plan: z.enum(MAINTENANCE_PLAN_TIERS),
});

export type SelectMaintenancePlanInput = z.infer<typeof selectMaintenancePlanSchema>;
