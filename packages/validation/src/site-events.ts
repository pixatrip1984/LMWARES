import { z } from 'zod';
import {
  SITE_EVENT_REGISTRATION_STATUSES,
  SITE_EVENT_STATUSES,
} from '@starter/domain';
import { emailSchema, idSchema, phoneSchema, slugSchema } from './primitives';

const projectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Id de proyecto inválido (usa letras, números, punto, guion o guion bajo).',
  );

const utcDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Usa una fecha ISO-8601 con zona horaria.' })
  .transform((value) => new Date(value).toISOString());

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(isValidTimezone, 'Zona horaria IANA inválida.');

const nullableText = (max: number) => z.string().trim().max(max).nullable().default(null);

const siteEventFieldsSchema = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(3).max(180),
    summary: nullableText(360),
    description: nullableText(12_000),
    venueName: nullableText(180),
    venueAddress: nullableText(500),
    timezone: timezoneSchema,
    startsAtUtc: utcDateTimeSchema,
    endsAtUtc: utcDateTimeSchema,
    registrationClosesAtUtc: utcDateTimeSchema.nullable().default(null),
    capacity: z.number().int().min(1).max(100_000).nullable().default(null),
    coverAssetId: idSchema.nullable().default(null),
  })
  .strict()
  .superRefine((event, context) => {
    const startsAt = Date.parse(event.startsAtUtc);
    const endsAt = Date.parse(event.endsAtUtc);
    if (endsAt <= startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAtUtc'],
        message: 'La fecha de fin debe ser posterior al inicio.',
      });
    }
    if (event.registrationClosesAtUtc && Date.parse(event.registrationClosesAtUtc) > startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationClosesAtUtc'],
        message: 'El cierre de inscripción no puede ser posterior al inicio.',
      });
    }
  });

export const createSiteEventSchema = siteEventFieldsSchema;
export type CreateSiteEventInput = z.infer<typeof createSiteEventSchema>;

export const updateSiteEventSchema = siteEventFieldsSchema;
export type UpdateSiteEventInput = z.infer<typeof updateSiteEventSchema>;

export const updateSiteEventStatusSchema = z
  .object({ status: z.enum(SITE_EVENT_STATUSES) })
  .strict();
export type UpdateSiteEventStatusInput = z.infer<typeof updateSiteEventStatusSchema>;

export const createSiteEventRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(140),
    email: emailSchema.max(254),
    phone: phoneSchema.nullish(),
    notes: z.string().trim().max(600).nullish(),
    /** Honeypot: debe permanecer vacío en clientes legítimos. */
    website: z.string().max(0, 'Solicitud inválida.').optional(),
  })
  .strict();
export type CreateSiteEventRegistrationInput = z.infer<typeof createSiteEventRegistrationSchema>;

export const updateSiteEventRegistrationStatusSchema = z
  .object({ status: z.enum(SITE_EVENT_REGISTRATION_STATUSES) })
  .strict();
export type UpdateSiteEventRegistrationStatusInput = z.infer<
  typeof updateSiteEventRegistrationStatusSchema
>;

export const siteEventProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const siteEventParamsSchema = z.object({
  projectId: projectIdSchema,
  eventId: idSchema,
});

export const siteEventRegistrationParamsSchema = siteEventParamsSchema.extend({
  registrationId: idSchema,
});

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
