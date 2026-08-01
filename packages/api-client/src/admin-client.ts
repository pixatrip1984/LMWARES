import type {
  AuditEvent,
  CommercialOffer,
  BillingOrder,
  MaintenanceSubscription,
  Paginated,
  Publication,
  PublicationImage,
  LmwaresApproval,
  LmwaresProject,
  LmwaresProjectSnapshot,
  LmwaresValidationResult,
  PackageIntake,
  PackageIntakeStatus,
  StarterWorkOrder,
  Request,
  RequestNote,
  RequestStatus,
  StatusHistory,
} from '@starter/domain';
import type {
  IssueCommercialOfferInput,
  CreatePublicationInput,
  CreateRequestNoteInput,
  UpdatePublicationInput,
  UpdatePublicationStatusInput,
  CreateLmwaresSnapshotInput,
  CreateLmwaresApprovalInput,
  CreateLmwaresValidationInput,
  SyncLmwaresProjectsInput,
} from '@starter/validation';
import { createHttpClient } from './http';

export interface AdminPublicationDetail extends Publication {
  images: Array<{ id: string; url: string; alt: string | null; position: number }>;
}

export interface AdminMe {
  email: string;
  name: string | null;
  role: string;
}

export interface LmwaresProjectRegistryResponse {
  projects: LmwaresProject[];
  source: 'd1-registry';
  syncedAt: string | null;
  upserted?: number;
}

/**
 * Cliente del Admin API Worker. Usa credenciales (cookie de Cloudflare Access)
 * en cada petición. Nunca incluye secretos: la identidad la maneja Access.
 */
export function createAdminClient(baseUrl: string) {
  const http = createHttpClient({ baseUrl, withCredentials: true });

  return {
    me() {
      return http.get<AdminMe>('/admin/me');
    },

    // ── LMWARES / Oracle ────────────────────────────────────
    listLmwaresProjects() {
      return http.get<LmwaresProjectRegistryResponse>('/admin/projects');
    },
    getLmwaresProject(id: string) {
      return http.get<LmwaresProject>(`/admin/projects/${encodeURIComponent(id)}`);
    },
    syncLmwaresProjects(input: SyncLmwaresProjectsInput) {
      return http.post<LmwaresProjectRegistryResponse>('/admin/projects/sync', input);
    },
    listLmwaresProjectSnapshots(id: string) {
      return http.get<LmwaresProjectSnapshot[]>(
        `/admin/projects/${encodeURIComponent(id)}/snapshots`,
      );
    },
    createLmwaresProjectSnapshot(id: string, input: CreateLmwaresSnapshotInput) {
      return http.post<LmwaresProjectSnapshot>(
        `/admin/projects/${encodeURIComponent(id)}/snapshots`,
        input,
      );
    },
    listLmwaresProjectValidations(id: string) {
      return http.get<LmwaresValidationResult[]>(
        `/admin/projects/${encodeURIComponent(id)}/validations`,
      );
    },
    createLmwaresProjectValidation(id: string, input: CreateLmwaresValidationInput) {
      return http.post<LmwaresValidationResult>(
        `/admin/projects/${encodeURIComponent(id)}/validations`,
        input,
      );
    },
    listLmwaresProjectApprovals(id: string) {
      return http.get<LmwaresApproval[]>(`/admin/projects/${encodeURIComponent(id)}/approvals`);
    },
    createLmwaresProjectApproval(id: string, input: CreateLmwaresApprovalInput) {
      return http.post<LmwaresApproval>(
        `/admin/projects/${encodeURIComponent(id)}/approvals`,
        input,
      );
    },

    // ── Solicitudes comerciales LMWares ─────────────────────
    listCommercialPackageIntakes(
      params: { status?: PackageIntakeStatus; limit?: number } = {},
    ) {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.limit) qs.set('limit', String(params.limit));
      const suffix = qs.toString() ? `?${qs}` : '';
      return http.get<{ intakes: PackageIntake[] }>(`/admin/commercial-intakes${suffix}`);
    },
    getCommercialPackageIntake(id: string) {
      return http.get<{
        intake: PackageIntake;
        offers: CommercialOffer[];
        billingOrder: BillingOrder | null;
        workOrder: StarterWorkOrder | null;
        maintenanceSubscription: MaintenanceSubscription | null;
      }>(
        `/admin/commercial-intakes/${encodeURIComponent(id)}`,
      );
    },
    assignStarterWorkOrder(id: string, projectId: string) {
      return http.post<{ workOrder: StarterWorkOrder }>(
        `/admin/commercial-intakes/${encodeURIComponent(id)}/work-order/assign`,
        { projectId },
      );
    },
    updateStarterWorkOrderStatus(
      id: string,
      status: 'in_build' | 'client_review' | 'ready_to_publish' | 'canceled',
    ) {
      return http.patch<{ workOrder: StarterWorkOrder }>(
        `/admin/commercial-intakes/${encodeURIComponent(id)}/work-order/status`,
        { status },
      );
    },
    publishStarterWorkOrder(id: string, publicUrl: string) {
      return http.post<{ workOrder: StarterWorkOrder }>(
        `/admin/commercial-intakes/${encodeURIComponent(id)}/work-order/go-live`,
        { publicUrl },
      );
    },
    issueCommercialOffer(id: string, input: IssueCommercialOfferInput) {
      return http.post<{ offer: CommercialOffer }>(
        `/admin/commercial-intakes/${encodeURIComponent(id)}/offers`,
        input,
      );
    },
    reopenExpiredImplementationPayment(id: string) {
      return http.post<{
        intake: PackageIntake;
        offers: CommercialOffer[];
        billingOrder: BillingOrder;
      }>(
        `/admin/commercial-intakes/${encodeURIComponent(id)}/implementation-payment/reopen`,
        {},
      );
    },
    reviewCommercialPackageIntake(
      id: string,
      input: { status: 'scope_review' | 'declined'; notes?: string | null },
    ) {
      return http.patch<{ intake: PackageIntake }>(
        `/admin/commercial-intakes/${encodeURIComponent(id)}/review`,
        input,
      );
    },

    // ── Publicaciones ────────────────────────────────────────
    getPublication(id: string) {
      return http.get<AdminPublicationDetail>(`/admin/publications/${id}`);
    },
    listPublications(params: { page?: number; pageSize?: number } = {}) {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', String(params.page));
      if (params.pageSize) qs.set('pageSize', String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : '';
      return http.get<Paginated<Publication>>(`/admin/publications${suffix}`);
    },
    createPublication(input: CreatePublicationInput) {
      return http.post<Publication>('/admin/publications', input);
    },
    updatePublication(id: string, input: UpdatePublicationInput) {
      return http.patch<Publication>(`/admin/publications/${id}`, input);
    },
    updatePublicationStatus(id: string, input: UpdatePublicationStatusInput) {
      return http.patch<Publication>(`/admin/publications/${id}/status`, input);
    },
    uploadPublicationImage(
      id: string,
      file: File | Blob,
      meta: { alt?: string; position?: number } = {},
    ) {
      const form = new FormData();
      form.set('file', file);
      if (meta.alt != null) form.set('alt', meta.alt);
      if (meta.position != null) form.set('position', String(meta.position));
      return http.post<PublicationImage>(`/admin/publications/${id}/images`, form);
    },
    deletePublicationImage(id: string, imageId: string) {
      return http.del<void>(`/admin/publications/${id}/images/${imageId}`);
    },

    // ── Solicitudes ──────────────────────────────────────────
    listRequests(
      params: { page?: number; pageSize?: number; status?: RequestStatus; type?: string } = {},
    ) {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', String(params.page));
      if (params.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params.status) qs.set('status', params.status);
      if (params.type) qs.set('type', params.type);
      const suffix = qs.toString() ? `?${qs}` : '';
      return http.get<Paginated<Request>>(`/admin/requests${suffix}`);
    },
    getRequest(id: string) {
      return http.get<{
        request: Request;
        notes: RequestNote[];
        history: StatusHistory[];
      }>(`/admin/requests/${id}`);
    },
    updateRequestStatus(id: string, status: RequestStatus, reason?: string) {
      return http.patch<Request>(`/admin/requests/${id}/status`, { status, reason });
    },
    addRequestNote(id: string, input: CreateRequestNoteInput) {
      return http.post<RequestNote>(`/admin/requests/${id}/notes`, input);
    },

    // ── Auditoría ────────────────────────────────────────────
    listAudit() {
      return http.get<AuditEvent[]>('/admin/audit');
    },
  };
}

export type AdminClient = ReturnType<typeof createAdminClient>;
