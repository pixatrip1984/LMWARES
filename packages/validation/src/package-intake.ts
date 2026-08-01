import { z } from 'zod';
import { PACKAGE_INTAKE_STATUSES, PACKAGE_MODULE_IDS, PAID_PACKAGE_PLANS } from '@starter/domain';

export const createPackageIntakeSchema = z.object({
  plan: z.enum(PAID_PACKAGE_PLANS),
  modules: z.array(z.enum(PACKAGE_MODULE_IDS)).min(2).max(PACKAGE_MODULE_IDS.length),
  marketing: z.boolean(),
});

export type CreatePackageIntakeInput = z.infer<typeof createPackageIntakeSchema>;

export const reviewPackageIntakeSchema = z.object({
  status: z.enum(['scope_review', 'declined']),
  notes: z.string().trim().max(2_000).nullish(),
});

export type ReviewPackageIntakeInput = z.infer<typeof reviewPackageIntakeSchema>;

export const listPackageIntakesSchema = z.object({
  status: z.enum(PACKAGE_INTAKE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListPackageIntakesInput = z.infer<typeof listPackageIntakesSchema>;
