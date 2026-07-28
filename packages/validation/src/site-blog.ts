import { z } from 'zod';
import { idSchema, slugSchema } from './primitives';

export const siteBlogProjectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Id de proyecto inválido (usa letras, números, punto, guion o guion bajo).',
  );

export const siteBlogArticleStatusSchema = z.enum(['draft', 'published', 'archived']);

const headingBlockSchema = z
  .object({
    type: z.literal('heading'),
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string().trim().min(1).max(300),
  })
  .strict();

const paragraphBlockSchema = z
  .object({
    type: z.literal('paragraph'),
    text: z.string().max(12_000),
  })
  .strict();

const quoteBlockSchema = z
  .object({
    type: z.literal('quote'),
    text: z.string().trim().min(1).max(4_000),
    attribution: z.string().trim().max(200).nullable().default(null),
  })
  .strict();

const listBlockSchema = z
  .object({
    type: z.enum(['bulleted-list', 'numbered-list']),
    items: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
  })
  .strict();

const dividerBlockSchema = z.object({ type: z.literal('divider') }).strict();

export const siteBlogBlockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  paragraphBlockSchema,
  quoteBlockSchema,
  listBlockSchema,
  dividerBlockSchema,
]);

export const siteBlogBodySchema = z.discriminatedUnion('format', [
  z
    .object({
      format: z.literal('blocks'),
      blocks: z.array(siteBlogBlockSchema).min(1).max(120),
    })
    .strict(),
  z
    .object({
      format: z.literal('html'),
      html: z.string().max(100_000),
    })
    .strict(),
]);
export type SiteBlogBodyInput = z.infer<typeof siteBlogBodySchema>;

const siteBlogArticleFields = {
  slug: slugSchema,
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().max(700).nullable().default(null),
  coverImageId: idSchema.nullable().default(null),
  category: z.string().trim().min(1).max(120),
  body: siteBlogBodySchema,
  status: siteBlogArticleStatusSchema.default('draft'),
};

/** Payload completo para crear un artículo. */
export const createSiteBlogArticleSchema = z.object(siteBlogArticleFields).strict();
export type CreateSiteBlogArticleInput = z.infer<typeof createSiteBlogArticleSchema>;

/** Edición parcial; `statusReason` sólo se persiste en el historial. */
export const updateSiteBlogArticleSchema = z
  .object(siteBlogArticleFields)
  .partial()
  .extend({
    statusReason: z.string().trim().max(280).nullable().optional(),
  })
  .strict()
  .refine(
    (input) => Object.keys(input).some((key) => key !== 'statusReason'),
    'Incluye al menos un campo para actualizar.',
  );
export type UpdateSiteBlogArticleInput = z.infer<typeof updateSiteBlogArticleSchema>;

export const listSiteBlogArticlesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
});
export type ListSiteBlogArticlesQuery = z.infer<typeof listSiteBlogArticlesQuerySchema>;
