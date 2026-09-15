import { z } from 'zod';

export const publishCommercialDemoSchema = z.object({
  html: z.string().trim().min(80).max(1_000_000),
});

export const completeCommercialPhaseSchema = z.object({
  evidence: z.string().trim().min(8).max(4_000),
});

export const commercialPhaseParamSchema = z.coerce.number().int().min(1).max(4) as z.ZodType<1 | 2 | 3 | 4>;
