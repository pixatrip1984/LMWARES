import { z } from 'zod';

export const assignStarterWorkOrderSchema = z.object({
  projectId: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
});

export const updateStarterWorkOrderStatusSchema = z.object({
  status: z.enum(['in_build', 'client_review', 'ready_to_publish', 'canceled']),
});

export type AssignStarterWorkOrderInput = z.infer<typeof assignStarterWorkOrderSchema>;
export type UpdateStarterWorkOrderStatusInput = z.infer<typeof updateStarterWorkOrderStatusSchema>;
