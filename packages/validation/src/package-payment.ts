import { z } from 'zod';
import { PACKAGE_MODULE_IDS, PAID_PACKAGE_PLANS } from '@starter/domain';

export const createTestPackageProposalSchema = z.object({
  plan: z.enum(PAID_PACKAGE_PLANS),
  modules: z.array(z.enum(PACKAGE_MODULE_IDS)).min(2).max(PACKAGE_MODULE_IDS.length),
  marketing: z.boolean(),
});
export type CreateTestPackageProposalInput = z.infer<typeof createTestPackageProposalSchema>;
