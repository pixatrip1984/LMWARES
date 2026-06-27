import { z } from 'zod';
import { REQUEST_STATUSES } from '@starter/domain';
import { emailSchema, idSchema, metadataSchema, phoneSchema } from './primitives';

export const requestStatusSchema = z.enum(REQUEST_STATUSES);

/**
 * Payload público para crear una solicitud. Incluye el token de Turnstile,
 * que el Worker valida server-side y NO persiste.
 */
export const createRequestSchema = z.object({
  type: z.string().trim().min(1).max(60).default('contact'),
  publicationId: idSchema.nullish(),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: emailSchema,
  contactPhone: phoneSchema.nullish(),
  message: z.string().trim().max(2000).nullish(),
  payload: metadataSchema.default({}),
  turnstileToken: z.string().min(1, 'Falta el token de Turnstile.'),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/** Lo que realmente se persiste (sin el token de Turnstile). */
export const persistedRequestSchema = createRequestSchema.omit({
  turnstileToken: true,
});

/** Cambio de estado de una solicitud (Admin API). */
export const updateRequestStatusSchema = z.object({
  status: requestStatusSchema,
  reason: z.string().trim().max(280).nullish(),
});
export type UpdateRequestStatusInput = z.infer<typeof updateRequestStatusSchema>;

/** Nota interna sobre una solicitud (Admin API). */
export const createRequestNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateRequestNoteInput = z.infer<typeof createRequestNoteSchema>;

/** Filtros de listado de solicitudes (Admin API). */
export const listRequestsQuerySchema = z.object({
  status: requestStatusSchema.optional(),
  type: z.string().trim().max(60).optional(),
});
