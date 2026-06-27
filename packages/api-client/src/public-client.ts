import type { Paginated, Publication } from '@starter/domain';
import type { CreateRequestInput } from '@starter/validation';
import { createHttpClient } from './http';

/** Publicación de detalle con sus imágenes resueltas (URLs públicas). */
export interface PublicationDetail extends Publication {
  images: Array<{ id: string; url: string; alt: string | null; position: number }>;
}

export interface CreateRequestResult {
  id: string;
  status: string;
}

/** Cliente del Public API Worker. Solo expone datos/acciones públicas. */
export function createPublicClient(baseUrl: string) {
  const http = createHttpClient({ baseUrl });

  return {
    listPublications(params: { page?: number; pageSize?: number; q?: string } = {}) {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', String(params.page));
      if (params.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params.q) qs.set('q', params.q);
      const suffix = qs.toString() ? `?${qs}` : '';
      return http.get<Paginated<Publication>>(`/publications${suffix}`);
    },

    getPublication(slug: string) {
      return http.get<PublicationDetail>(`/publications/${encodeURIComponent(slug)}`);
    },

    /** Envía una solicitud. `turnstileToken` se valida server-side. */
    createRequest(input: CreateRequestInput) {
      return http.post<CreateRequestResult>('/requests', input);
    },
  };
}

export type PublicClient = ReturnType<typeof createPublicClient>;
