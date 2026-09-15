import { z } from 'zod';

const answerValue = z.union([
  z.string().trim().min(1).max(500),
  z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  z.boolean(),
]);

const key = z.string().regex(/^[a-z][a-z0-9_]{1,60}$/);

export const businessProfileSchema = z.object({
  schemaVersion: z.literal('lmwares.business-profile.v1'),
  explicitAnswers: z.record(key, answerValue).refine((value) => Object.keys(value).length <= 40, 'Demasiadas respuestas de entrevista.'),
  inferences: z.array(z.object({
    key,
    value: answerValue,
    confidence: z.enum(['high', 'medium']),
    basedOn: z.array(key).min(1).max(8),
  })).max(40),
  business: z.object({ model: z.string().max(80), industry: z.string().max(80), offerTypes: z.array(z.string().max(80)).max(12) }),
  salesFlow: z.object({ leadSources: z.array(z.string().max(80)).max(12), startsWith: z.string().max(80), channels: z.array(z.string().max(80)).max(12) }),
  operations: z.object({
    teamSize: z.string().max(80),
    needsInventory: z.boolean().nullable(), needsAppointments: z.boolean().nullable(), needsProjectTracking: z.boolean().nullable(),
    needsCustomerRecords: z.boolean().nullable(), needsFollowUp: z.boolean().nullable(), needsTeamAccess: z.boolean().nullable(), needsRolePermissions: z.boolean().nullable(),
  }),
  entities: z.array(z.string().max(80)).max(20),
  requirements: z.object({ publicWebsite: z.array(z.string().max(80)).max(20), internalSystem: z.array(z.string().max(80)).max(20), suggestedModules: z.array(z.string().max(40)).max(12) }),
  contentAssets: z.array(z.string().max(80)).max(12),
  visualPreferences: z.array(z.string().max(80)).max(6),
  confidence: z.object({ completeness: z.number().min(0).max(1), unresolved: z.array(key).max(20) }),
});

export const businessInterviewSubmissionSchema = z.object({
  schemaVersion: z.literal('lmwares.business-interview-submission.v1'),
  profile: businessProfileSchema,
  completedAt: z.string().datetime(),
});

export type BusinessInterviewSubmissionInput = z.infer<typeof businessInterviewSubmissionSchema>;
