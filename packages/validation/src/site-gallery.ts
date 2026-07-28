import { z } from 'zod';
import { idSchema, slugSchema } from './primitives';

export const SITE_GALLERY_ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const SITE_GALLERY_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SITE_GALLERY_MAX_IMAGES_PER_ALBUM = 200;
export const SITE_GALLERY_MIN_IMAGE_DIMENSION = 32;
export const SITE_GALLERY_MAX_IMAGE_DIMENSION = 12_000;
export const SITE_GALLERY_MAX_IMAGE_PIXELS = 50_000_000;

export const siteGalleryProjectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Id de proyecto inválido (usa letras, números, punto, guion o guion bajo).',
  );

export const siteGalleryAlbumIdSchema = idSchema;
export const siteGalleryImageIdSchema = idSchema;

const albumFieldsSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2_000).nullable(),
  category: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(100_000),
});

/** Todo álbum nace en draft; publicar es una acción separada y auditable. */
export const createSiteGalleryAlbumSchema = albumFieldsSchema.strict();
export type CreateSiteGalleryAlbumInput = z.infer<
  typeof createSiteGalleryAlbumSchema
>;

export const updateSiteGalleryAlbumSchema = albumFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Incluye al menos un campo para guardar.',
  });
export type UpdateSiteGalleryAlbumInput = z.infer<
  typeof updateSiteGalleryAlbumSchema
>;

export const siteGalleryStatusReasonSchema = z
  .object({
    reason: z.string().trim().max(280).nullish(),
  })
  .strict();

export const siteGalleryUploadFieldsSchema = z
  .object({
    alt: z.string().trim().max(240).nullish(),
  })
  .strict();

export const reorderSiteGalleryImagesSchema = z
  .object({
    imageIds: z
      .array(siteGalleryImageIdSchema)
      .min(1)
      .max(SITE_GALLERY_MAX_IMAGES_PER_ALBUM),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.imageIds).size !== value.imageIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['imageIds'],
        message: 'El orden no puede contener imágenes duplicadas.',
      });
    }
  });
export type ReorderSiteGalleryImagesInput = z.infer<
  typeof reorderSiteGalleryImagesSchema
>;

export const setSiteGalleryCoverSchema = z
  .object({
    imageId: siteGalleryImageIdSchema,
  })
  .strict();

export const updateSiteGalleryImageSchema = z
  .object({
    alt: z.string().trim().max(240).nullable(),
  })
  .strict();

export const listPublicSiteGalleriesQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
  })
  .strict();
