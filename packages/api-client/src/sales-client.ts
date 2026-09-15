import type { CommercialOperation, SalesActor, CommercialScopeDraft } from '@starter/domain';
import { createHttpClient } from './http';

export function createSalesClient(baseUrl: string) {
  const http = createHttpClient({ baseUrl, withCredentials: true });
  return {
    me: () =>
      http.get<{ seller: Pick<SalesActor, 'id' | 'displayName' | 'emailNormalized'> }>('/sales/me'),
    listOperations: () => http.get<{ operations: CommercialOperation[] }>('/sales/operations'),
    getOperation: (id: string) =>
      http.get<{ operation: CommercialOperation }>(`/sales/operations/${encodeURIComponent(id)}`),
    updateOperationDraft: (
      id: string,
      input: { rowVersion: number; requirementBrief: Record<string, unknown> },
    ) =>
      http.patch<{ operation: CommercialOperation }>(
        `/sales/operations/${encodeURIComponent(id)}`,
        input,
      ),
    generateScope: (id: string) =>
      http.post<{ proposal: { id: string; version: number; operation: CommercialOperation }; draft: CommercialScopeDraft }>(
        `/sales/operations/${encodeURIComponent(id)}/generate-scope`,
        {},
        { signal: AbortSignal.timeout(70_000) },
      ),
    getScope: (id: string) => http.get<{ id: string; version: number; draft: CommercialScopeDraft }>(`/sales/operations/${encodeURIComponent(id)}/scope`),
    dedupHints: (input: { email?: string; businessName?: string }) =>
      http.post<{ hints: { emailExists: boolean; businessExists: boolean } }>(
        '/sales/operations/dedup-hints',
        input,
      ),
    createOperation: (
      input: {
        contact: { displayName: string; email: string };
        business?: { tradeName: string; legalName?: string | null } | null;
        requirementBrief?: Record<string, unknown>;
      },
      idempotencyKey: string,
    ) =>
      http.post<{ operation: CommercialOperation }>('/sales/operations', input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
  };
}

export type SalesClient = ReturnType<typeof createSalesClient>;
