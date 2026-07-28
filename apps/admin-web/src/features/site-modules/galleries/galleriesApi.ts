import { createHttpClient } from '@starter/api-client';
import { config } from '../../../lib/config';

export type GalleryStatus = 'draft' | 'published';

export interface GalleryImageView {
  id: string;
  alt: string | null;
  position: number;
  width: number;
  height: number;
  createdAt: string;
  url: string;
}

export interface GalleryAlbum {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: GalleryStatus;
  coverImageId: string | null;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryAlbumSummary extends GalleryAlbum {
  imageCount: number;
  coverImage: GalleryImageView | null;
}

export interface GalleryAlbumDetail extends GalleryAlbum {
  images: GalleryImageView[];
  coverImage: GalleryImageView | null;
}

export interface GalleryAlbumFields {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  sortOrder: number;
}

export interface GalleryAlbumListResponse {
  projectId: string;
  albums: GalleryAlbumSummary[];
}

const http = createHttpClient({
  baseUrl: config.apiUrl,
  withCredentials: true,
});

function modulePath(projectId: string): string {
  return `/admin/projects/${encodeURIComponent(
    projectId,
  )}/modules/galleries`;
}

export const galleriesApi = {
  list(projectId: string) {
    return http.get<GalleryAlbumListResponse>(modulePath(projectId));
  },

  get(projectId: string, albumId: string) {
    return http.get<GalleryAlbumDetail>(
      `${modulePath(projectId)}/${encodeURIComponent(albumId)}`,
    );
  },

  create(projectId: string, input: GalleryAlbumFields) {
    return http.post<GalleryAlbumDetail>(modulePath(projectId), input);
  },

  update(
    projectId: string,
    albumId: string,
    input: Partial<GalleryAlbumFields>,
  ) {
    return http.patch<GalleryAlbumDetail>(
      `${modulePath(projectId)}/${encodeURIComponent(albumId)}`,
      input,
    );
  },

  saveDraft(projectId: string, albumId: string) {
    return http.post<GalleryAlbumDetail>(
      `${modulePath(projectId)}/${encodeURIComponent(albumId)}/draft`,
      {},
    );
  },

  publish(projectId: string, albumId: string) {
    return http.post<GalleryAlbumDetail>(
      `${modulePath(projectId)}/${encodeURIComponent(albumId)}/publish`,
      {},
    );
  },

  uploadImage(
    projectId: string,
    albumId: string,
    file: File,
    alt?: string,
  ) {
    const body = new FormData();
    body.set('file', file);
    if (alt) body.set('alt', alt);
    return http.post<GalleryImageView>(
      `${modulePath(projectId)}/${encodeURIComponent(albumId)}/images`,
      body,
    );
  },

  reorderImages(
    projectId: string,
    albumId: string,
    imageIds: string[],
  ) {
    return http.patch<GalleryAlbumDetail>(
      `${modulePath(projectId)}/${encodeURIComponent(
        albumId,
      )}/images/order`,
      { imageIds },
    );
  },

  setCover(projectId: string, albumId: string, imageId: string) {
    return http.patch<GalleryAlbumDetail>(
      `${modulePath(projectId)}/${encodeURIComponent(albumId)}/cover`,
      { imageId },
    );
  },

  updateImageAlt(
    projectId: string,
    albumId: string,
    imageId: string,
    alt: string | null,
  ) {
    return http.patch<GalleryImageView>(
      `${modulePath(projectId)}/${encodeURIComponent(
        albumId,
      )}/images/${encodeURIComponent(imageId)}`,
      { alt },
    );
  },

  deleteImage(projectId: string, albumId: string, imageId: string) {
    return http.del<void>(
      `${modulePath(projectId)}/${encodeURIComponent(
        albumId,
      )}/images/${encodeURIComponent(imageId)}`,
    );
  },
};
