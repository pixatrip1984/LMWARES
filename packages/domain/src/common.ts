/**
 * Tipos primitivos compartidos por todos los modelos del dominio.
 * Mantener este archivo libre de dependencias externas.
 */

/** UUID v4 en formato string. Los IDs se generan en el servidor (Workers). */
export type Id = string;

/** Fecha/hora en ISO-8601 UTC, p.ej. "2026-06-26T12:00:00.000Z". */
export type IsoDateTime = string;

/** Bolsa de metadatos extensible por proyecto. Se guarda como JSON en D1. */
export type Metadata = Record<string, unknown>;

/** Marcas de tiempo estándar presentes en casi todas las entidades. */
export interface Timestamps {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Página de resultados para endpoints de listado. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/** Parámetros de paginación normalizados. */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
