import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@starter/domain';

/** Slug: minúsculas, números y guiones. No empieza/termina en guión. */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido (usa minúsculas, números y guiones).');

export const idSchema = z.string().uuid('Id inválido.');

export const emailSchema = z.string().trim().toLowerCase().email('Email inválido.');

/** Teléfono laxo: dígitos, espacios y símbolos comunes. */
export const phoneSchema = z
  .string()
  .trim()
  .min(5)
  .max(30)
  .regex(/^[0-9+()\-.\s]+$/, 'Teléfono inválido.');

/** Metadatos JSON arbitrarios pero acotados a objeto. */
export const metadataSchema = z.record(z.string(), z.unknown());

/** Query de paginación con coerción desde strings de URL y clamping. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
