import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';
import type { PublicationStatus } from './status';

/**
 * Entidad genérica de contenido publicable: sirve como item de catálogo,
 * pieza de portfolio, registro de galería, entrada de blog, etc.
 * La lógica específica del proyecto se modela en `metadata` + campos extra.
 */
export interface Publication extends Timestamps {
  id: Id;
  /** Slug único y estable usado en la URL pública. */
  slug: string;
  title: string;
  summary: string | null;
  /** Cuerpo largo (markdown o texto plano). */
  body: string | null;
  status: PublicationStatus;
  /** FileAsset usado como portada (R2). */
  coverImageId: Id | null;
  /** Datos arbitrarios por proyecto (precio, categoría, specs...). */
  metadata: Metadata;
  /** Para ordenar manualmente en el frontend público. */
  sortOrder: number;
  publishedAt: IsoDateTime | null;
}

/** Relación publicación ↔ imagen (galería ordenada). */
export interface PublicationImage {
  id: Id;
  publicationId: Id;
  fileAssetId: Id;
  alt: string | null;
  position: number;
  createdAt: IsoDateTime;
}

/** Publicación con sus imágenes resueltas (vista de detalle). */
export interface PublicationWithImages extends Publication {
  images: Array<PublicationImage & { key: string; contentType: string }>;
}
