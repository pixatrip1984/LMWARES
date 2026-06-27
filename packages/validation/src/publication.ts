import { z } from 'zod';
import { PUBLICATION_STATUSES } from '@starter/domain';
import { idSchema, metadataSchema, slugSchema } from './primitives';

export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);

/** Payload para crear una publicación (Admin API). */
export const createPublicationSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(500).nullish(),
  body: z.string().max(20000).nullish(),
  status: publicationStatusSchema.default('draft'),
  coverImageId: idSchema.nullish(),
  metadata: metadataSchema.default({}),
  sortOrder: z.number().int().default(0),
});
export type CreatePublicationInput = z.infer<typeof createPublicationSchema>;

/** Payload para editar una publicación: todos los campos opcionales. */
export const updatePublicationSchema = createPublicationSchema.partial();
export type UpdatePublicationInput = z.infer<typeof updatePublicationSchema>;

/** Cambio de estado con razón opcional (registra StatusHistory). */
export const updatePublicationStatusSchema = z.object({
  status: publicationStatusSchema,
  reason: z.string().trim().max(280).nullish(),
});
export type UpdatePublicationStatusInput = z.infer<
  typeof updatePublicationStatusSchema
>;

/** Metadatos al asociar una imagen a una publicación. */
export const addPublicationImageSchema = z.object({
  alt: z.string().trim().max(200).nullish(),
  position: z.coerce.number().int().min(0).default(0),
});
export type AddPublicationImageInput = z.infer<typeof addPublicationImageSchema>;

/** Filtros de listado para el frontend público. */
export const listPublicationsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
});
