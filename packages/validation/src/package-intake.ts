import { z } from 'zod';
import { PACKAGE_INTAKE_STATUSES, PACKAGE_MODULE_IDS, PAID_PACKAGE_PLANS } from '@starter/domain';
import { businessInterviewSubmissionSchema } from './business-interview';

const briefTextField = (max: number) => z.string().trim().min(1).max(max);
const briefOptionalTextField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const MAINTENANCE_PLAN_PREFERENCES = ['later', 'none', 'basic', 'advanced'] as const;

export const packageIntakeBriefSchema = z.object({
  contactName: briefTextField(120),
  contactPhone: briefTextField(30),
  businessName: briefTextField(120),
  businessSummary: briefTextField(600),
  siteGoal: briefTextField(600),
  stylePreference: briefOptionalTextField(200),
  referenceNotes: briefOptionalTextField(600),
  customDomainPreference: briefOptionalTextField(253),
  maintenancePlanPreference: z.enum(MAINTENANCE_PLAN_PREFERENCES).default('later'),
  maintenanceSecurityAddOn: z.boolean().default(false),
});

export type PackageIntakeBriefInput = z.infer<typeof packageIntakeBriefSchema>;

export const createPackageIntakeSchema = z.object({
  plan: z.enum(PAID_PACKAGE_PLANS),
  modules: z.array(z.enum(PACKAGE_MODULE_IDS)).min(2).max(PACKAGE_MODULE_IDS.length),
  marketing: z.boolean(),
  brief: packageIntakeBriefSchema,
  interview: businessInterviewSubmissionSchema.optional(),
  discountCode: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((value) => (value ? value.toUpperCase().replace(/\s+/g, '') : null)),
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
