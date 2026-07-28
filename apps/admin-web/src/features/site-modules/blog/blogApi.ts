import { createHttpClient } from '@starter/api-client';
import type { SiteBlogArticleView } from '@starter/domain';
import type {
  CreateSiteBlogArticleInput,
  UpdateSiteBlogArticleInput,
} from '@starter/validation';
import { config } from '../../../lib/config';

export interface AdminBlogArticleList {
  items: SiteBlogArticleView[];
}

const http = createHttpClient({
  baseUrl: config.apiUrl,
  withCredentials: true,
});

function modulePath(projectId: string): string {
  return `/admin/projects/${encodeURIComponent(projectId)}/modules/blog`;
}

export const blogApi = {
  list(projectId: string) {
    return http.get<AdminBlogArticleList>(modulePath(projectId));
  },

  get(projectId: string, slug: string) {
    return http.get<SiteBlogArticleView>(`${modulePath(projectId)}/${encodeURIComponent(slug)}`);
  },

  create(projectId: string, input: CreateSiteBlogArticleInput) {
    return http.post<SiteBlogArticleView>(modulePath(projectId), input);
  },

  update(projectId: string, currentSlug: string, input: UpdateSiteBlogArticleInput) {
    return http.patch<SiteBlogArticleView>(
      `${modulePath(projectId)}/${encodeURIComponent(currentSlug)}`,
      input,
    );
  },

  uploadCover(projectId: string, slug: string, file: File) {
    const form = new FormData();
    form.set('file', file);
    return http.post<SiteBlogArticleView>(
      `${modulePath(projectId)}/${encodeURIComponent(slug)}`,
      form,
    );
  },
};
