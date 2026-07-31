import { z } from 'zod';
import {
  FREE_CONTACT_PLATFORMS,
  FREE_INTAKE_STATUSES,
  type FreeContactPlatform,
} from '@starter/domain';
import { emailSchema, idSchema, slugSchema } from './primitives';

export const FREE_INTAKE_IMAGE_LIMIT = 5;
export const FREE_INTAKE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const FREE_LAYOUT_PRESETS = ['editorial', 'impact', 'minimal', 'showcase'] as const;
export const FREE_PALETTE_PRESETS = [
  'automatic',
  'professional-blue',
  'clinical-teal',
  'industrial-orange',
  'natural-green',
  'culinary-terra',
  'wellness-rose',
  'night-fire',
] as const;

export const freeContactMethodInputSchema = z.object({
  platform: z.enum(FREE_CONTACT_PLATFORMS),
  value: z.string().trim().min(2).max(240),
  label: z.string().trim().max(80).optional(),
  publicVisible: z.boolean().default(true),
});
export type FreeContactMethodInput = z.infer<typeof freeContactMethodInputSchema>;

export const freeLocationInputSchema = z.object({
  address: z.string().trim().min(4).max(240),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  zoom: z.number().int().min(10).max(18).default(16),
});
export type FreeLocationInput = z.infer<typeof freeLocationInputSchema>;

export const freePageDetailsInputSchema = z.object({
  services: z.array(z.string().trim().min(2).max(80)).min(1).max(8).default([]),
  hours: z.string().trim().max(180).optional(),
  serviceArea: z.string().trim().max(220).optional(),
  trustLine: z.string().trim().max(180).optional(),
  colorPreference: z.string().trim().max(120).optional(),
  layoutPreset: z.enum(FREE_LAYOUT_PRESETS).default('editorial'),
  palettePreset: z.enum(FREE_PALETTE_PRESETS).default('automatic'),
  location: freeLocationInputSchema.optional(),
});
export type FreePageDetailsInput = z.infer<typeof freePageDetailsInputSchema>;

export const createFreeIntakeSchema = z.object({
  slug: slugSchema.max(60),
  siteName: z.string().trim().min(2).max(80),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: emailSchema,
  businessDescription: z.string().trim().min(20).max(1600),
  audience: z.string().trim().min(6).max(500),
  sector: z.string().trim().max(120).optional(),
  style: z.string().trim().min(2).max(160),
  primaryAction: z.string().trim().min(2).max(80).default('contactar'),
  freePage: freePageDetailsInputSchema.optional(),
  contacts: z.array(freeContactMethodInputSchema).min(1).max(12),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar la publicación de la información enviada.' }),
  }),
  turnstileToken: z.string().trim().min(1).optional(),
});
export type CreateFreeIntakeInput = z.infer<typeof createFreeIntakeSchema>;

export const freeIntakeStatusQuerySchema = z.object({
  id: idSchema,
});
export type FreeIntakeStatusQuery = z.infer<typeof freeIntakeStatusQuerySchema>;

export const submitFreeIntakeSchema = z.object({
  turnstileToken: z.string().trim().min(1).optional(),
});
export type SubmitFreeIntakeInput = z.infer<typeof submitFreeIntakeSchema>;

export const checkFreeSlugSchema = z.object({
  slug: slugSchema.max(60),
});
export type CheckFreeSlugInput = z.infer<typeof checkFreeSlugSchema>;

export const listFreeIntakesQuerySchema = z.object({
  status: z.enum(FREE_INTAKE_STATUSES).optional(),
  slug: slugSchema.max(60).optional(),
});
export type ListFreeIntakesQuery = z.infer<typeof listFreeIntakesQuerySchema>;

export function normalizeContactPlatform(value: string): FreeContactPlatform {
  return FREE_CONTACT_PLATFORMS.includes(value as FreeContactPlatform)
    ? (value as FreeContactPlatform)
    : 'other';
}
