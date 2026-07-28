import { createHttpClient } from '@starter/api-client';
import type {
  SiteForm,
  SiteFormDefinition,
  SiteFormRequest,
  SiteFormRequestDetail,
  SiteFormRequestNote,
  SiteFormRequestStatus,
} from '@starter/domain';
import { config } from '../../../lib/config';

export interface SiteFormRequestsPage {
  items: SiteFormRequest[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface FormsWorkspaceResponse {
  form: SiteForm;
  requests: SiteFormRequestsPage;
}

const http = createHttpClient({
  baseUrl: config.apiUrl,
  withCredentials: true,
});

function modulePath(projectId: string): string {
  return `/admin/projects/${encodeURIComponent(projectId)}/modules/forms`;
}

export const formsApi = {
  getWorkspace(projectId: string) {
    return http.get<FormsWorkspaceResponse>(modulePath(projectId));
  },

  saveDefinition(projectId: string, definition: SiteFormDefinition) {
    return http.patch<SiteForm>(`${modulePath(projectId)}/definition`, definition);
  },

  publish(projectId: string) {
    return http.post<SiteForm>(`${modulePath(projectId)}/publish`);
  },

  listRequests(
    projectId: string,
    filters: { page?: number; pageSize?: number; status?: SiteFormRequestStatus } = {},
  ) {
    const query = new URLSearchParams();
    if (filters.page) query.set('page', String(filters.page));
    if (filters.pageSize) query.set('pageSize', String(filters.pageSize));
    if (filters.status) query.set('status', filters.status);
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return http.get<SiteFormRequestsPage>(`${modulePath(projectId)}/requests${suffix}`);
  },

  getRequest(projectId: string, requestId: string) {
    return http.get<SiteFormRequestDetail>(
      `${modulePath(projectId)}/requests/${encodeURIComponent(requestId)}`,
    );
  },

  updateRequestStatus(
    projectId: string,
    requestId: string,
    status: SiteFormRequestStatus,
    reason?: string,
  ) {
    return http.patch<SiteFormRequest>(
      `${modulePath(projectId)}/requests/${encodeURIComponent(requestId)}/status`,
      { status, reason },
    );
  },

  addRequestNote(projectId: string, requestId: string, body: string) {
    return http.post<SiteFormRequestNote>(
      `${modulePath(projectId)}/requests/${encodeURIComponent(requestId)}/notes`,
      { body },
    );
  },
};
