import type { Id, IsoDateTime, Timestamps } from '../common';

/** Ciclo editorial deliberadamente pequeño para la vertical de galerías. */
export const SITE_GALLERY_STATUSES = ['draft', 'published'] as const;
export type SiteGalleryStatus = (typeof SITE_GALLERY_STATUSES)[number];

/**
 * Un álbum es la categoría navegable efectiva del módulo público.
 * `category` es una etiqueta editorial; no crea un nivel adicional de rutas.
 */
export interface SiteGalleryAlbum extends Timestamps {
  id: Id;
  projectId: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: SiteGalleryStatus;
  coverImageId: Id | null;
  sortOrder: number;
  publishedAt: IsoDateTime | null;
}

/** Relación ordenada entre un álbum y un FileAsset de imagen. */
export interface SiteGalleryImage {
  id: Id;
  albumId: Id;
  fileAssetId: Id;
  alt: string | null;
  position: number;
  width: number;
  height: number;
  createdAt: IsoDateTime;
}

/** Forma segura que las APIs entregan al navegador; nunca expone la key de R2. */
export interface SiteGalleryImageView
  extends Omit<SiteGalleryImage, 'albumId' | 'fileAssetId'> {
  url: string;
}

/** Tarjeta del listado de álbumes, tanto en admin como en público. */
export interface SiteGalleryAlbumSummary extends SiteGalleryAlbum {
  imageCount: number;
  coverImage: SiteGalleryImageView | null;
}

/** Álbum resuelto para edición o para la vista pública. */
export interface SiteGalleryAlbumDetail extends SiteGalleryAlbum {
  images: SiteGalleryImageView[];
  coverImage: SiteGalleryImageView | null;
}

export interface SiteGalleryAlbumList {
  projectId: string;
  albums: SiteGalleryAlbumSummary[];
}
