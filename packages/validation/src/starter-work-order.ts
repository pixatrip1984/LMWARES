import { z } from 'zod';

export const assignStarterWorkOrderSchema = z.object({
  projectId: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
});

export const updateStarterWorkOrderStatusSchema = z.object({
  status: z.enum(['in_build', 'client_review', 'ready_to_publish', 'canceled']),
});

export const publishStarterWorkOrderSchema = z.object({
  publicUrl: z.string().trim().url().max(500).superRefine((value, ctx) => {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname.toLowerCase().endsWith('.lmwares.com')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El primer despliegue debe usar un subdominio HTTPS de lmwares.com.',
      });
    }
  }),
});

export type AssignStarterWorkOrderInput = z.infer<typeof assignStarterWorkOrderSchema>;
export type UpdateStarterWorkOrderStatusInput = z.infer<typeof updateStarterWorkOrderStatusSchema>;
export type PublishStarterWorkOrderInput = z.infer<typeof publishStarterWorkOrderSchema>;
