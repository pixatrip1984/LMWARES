import type {
  SiteDoc,
  SiteDocAccessLevel,
  SiteDocCategory,
  SiteDocsAdminLibrary,
  SiteDocVersion,
  SiteDocWithCurrentVersion,
} from '@starter/domain';

const API_BASE = (import.meta.env.VITE_ADMIN_API_URL ?? 'http://127.0.0.1:8888').replace(/\/$/, '');

export interface SiteDocDraft {
  title: string;
  description: string | null;
  categoryId: string | null;
  accessLevel: SiteDocAccessLevel;
  downloadEnabled: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
}

export interface NewSiteDocUpload extends SiteDocDraft {
  file: File;
}

export const docsApi = {
  list(projectId: string) {
    return request<SiteDocsAdminLibrary>(basePath(projectId));
  },
  createCategory(
    projectId: string,
    input: { name: string; slug: string; description?: string | null; sortOrder?: number },
  ) {
    return request<SiteDocCategory>(`${basePath(projectId)}/categories`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateCategory(
    projectId: string,
    categoryId: string,
    input: Partial<Pick<SiteDocCategory, 'name' | 'slug' | 'description' | 'sortOrder'>>,
  ) {
    return request<SiteDocCategory>(
      `${basePath(projectId)}/categories/${encodeURIComponent(categoryId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  },
  deleteCategory(projectId: string, categoryId: string) {
    return request<void>(`${basePath(projectId)}/categories/${encodeURIComponent(categoryId)}`, {
      method: 'DELETE',
    });
  },
  createDocument(projectId: string, input: NewSiteDocUpload) {
    return request<SiteDocWithCurrentVersion>(`${basePath(projectId)}/documents`, {
      method: 'POST',
      body: uploadForm(input),
    });
  },
  addVersion(projectId: string, documentId: string, file: File) {
    const form = new FormData();
    form.set('file', file);
    return request<SiteDocWithCurrentVersion>(
      `${basePath(projectId)}/documents/${encodeURIComponent(documentId)}/versions`,
      { method: 'POST', body: form },
    );
  },
  listVersions(projectId: string, documentId: string) {
    return request<SiteDocVersion[]>(
      `${basePath(projectId)}/documents/${encodeURIComponent(documentId)}/versions`,
    );
  },
  updateDocument(projectId: string, documentId: string, input: Partial<SiteDocDraft>) {
    return request<SiteDocWithCurrentVersion>(
      `${basePath(projectId)}/documents/${encodeURIComponent(documentId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  },
  publish(projectId: string, documentId: string) {
    return request<SiteDocWithCurrentVersion>(
      `${basePath(projectId)}/documents/${encodeURIComponent(documentId)}/publish`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  },
  unpublish(projectId: string, documentId: string) {
    return request<SiteDocWithCurrentVersion>(
      `${basePath(projectId)}/documents/${encodeURIComponent(documentId)}/unpublish`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  },
  previewUrl(projectId: string, documentId: string, versionId: string) {
    return `${API_BASE}${basePath(projectId)}/documents/${encodeURIComponent(
      documentId,
    )}/versions/${encodeURIComponent(versionId)}/preview`;
  },
};

function basePath(projectId: string): string {
  return `/admin/projects/${encodeURIComponent(projectId)}/modules/docs`;
}

function uploadForm(input: NewSiteDocUpload): FormData {
  const form = new FormData();
  form.set('file', input.file);
  form.set('title', input.title);
  form.set('description', input.description ?? '');
  form.set('categoryId', input.categoryId ?? '');
  form.set('accessLevel', input.accessLevel);
  form.set('downloadEnabled', String(input.downloadEnabled));
  form.set('sortOrder', String(input.sortOrder));
  form.set('metadata', JSON.stringify(input.metadata));
  return form;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as
    | T
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data ? data.error?.message : undefined;
    throw new Error(message || `Error HTTP ${response.status}`);
  }
  return data as T;
}

export type { SiteDoc, SiteDocCategory, SiteDocsAdminLibrary, SiteDocVersion };
