import type { Id, IsoDateTime } from '../common';

/**
 * Metadatos de un archivo almacenado en R2.
 * El binario vive en R2; D1 solo guarda este registro.
 */
export interface FileAsset {
  id: Id;
  /** Clave del objeto en R2, p.ej. "publications/<pubId>/<uuid>.jpg". */
  key: string;
  /** Nombre lógico del bucket (referencia, no binding). */
  bucket: string;
  contentType: string;
  sizeBytes: number;
  originalName: string | null;
  /** Hash opcional para deduplicar / verificar integridad. */
  checksum: string | null;
  /** Email del AdminUser que subió el archivo, o null si fue público/sistema. */
  createdBy: string | null;
  createdAt: IsoDateTime;
}
