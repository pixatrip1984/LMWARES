import type { Paginated, PublicAuthSession, Publication } from '@starter/domain';
import type { CreateFreeIntakeInput, CreateRequestInput, SubmitFreeIntakeInput } from '@starter/validation';
import { createHttpClient } from './http';

/** Publicación de detalle con sus imágenes resueltas (URLs públicas). */
export interface PublicationDetail extends Publication {
  images: Array<{ id: string; url: string; alt: string | null; position: number }>;
}

export interface CreateRequestResult {
  id: string;
  status: string;
}

export interface CreateFreeIntakeResult {
  id: string;
  slug: string;
  status: string;
}

export interface FreeSlugAvailability {
  slug: string;
  available: boolean;
  suggestions: string[];
}

export interface FreeImageUploadResult {
  id: string;
  fileAssetId: string;
  status: string;
  checksum: string;
}

export interface SubmitFreeIntakeResult {
  id: string;
  slug: string;
  status: string;
  jobStatus: string | null;
  publicUrl: string | null;
}

export interface FreeIntakeStatusResult {
  intake: {
    id: string;
    slug: string;
    status: string;
    publishedUrl: string | null;
  };
  job: { status: string; errorCode: string | null; errorMessage: string | null } | null;
  publicUrl: string | null;
  assetCount: number;
}

/** Cliente del Public API Worker. Solo expone datos/acciones públicas. */
export function createPublicClient(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const http = createHttpClient({ baseUrl: normalizedBaseUrl, withCredentials: true });

  return {
    getAuthSession() {
      return http.get<PublicAuthSession>('/auth/session');
    },

    getGoogleAuthUrl(returnTo = '/configurar') {
      const query = new URLSearchParams({ returnTo });
      return `${normalizedBaseUrl}/auth/google/start?${query}`;
    },

    logout() {
      return http.post<void>('/auth/logout');
    },

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

    checkFreeSlug(slug: string) {
      return http.get<FreeSlugAvailability>(`/free/slugs/${encodeURIComponent(slug)}`);
    },

    createFreeIntake(input: CreateFreeIntakeInput) {
      return http.post<CreateFreeIntakeResult>('/free', input);
    },

    uploadFreeIntakeImage(intakeId: string, file: File) {
      const form = new FormData();
      form.set('image', file);
      return http.post<FreeImageUploadResult>(`/free/${encodeURIComponent(intakeId)}/images`, form);
    },

    submitFreeIntake(intakeId: string, input: SubmitFreeIntakeInput = {}) {
      return http.post<SubmitFreeIntakeResult>(`/free/${encodeURIComponent(intakeId)}/submit`, input);
    },

    getFreeIntakeStatus(intakeId: string) {
      return http.get<FreeIntakeStatusResult>(`/free/${encodeURIComponent(intakeId)}/status`);
    },
  };
}

export type PublicClient = ReturnType<typeof createPublicClient>;
