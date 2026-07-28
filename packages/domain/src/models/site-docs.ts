import type { Id, IsoDateTime, Metadata } from '../common';

export const SITE_DOC_STATUSES = [
  'uploading',
  'quarantine',
  'scanning',
  'clean',
  'rejected',
  'published',
] as const;
export type SiteDocStatus = (typeof SITE_DOC_STATUSES)[number];

export const SITE_DOC_ACCESS_LEVELS = ['public', 'private'] as const;
export type SiteDocAccessLevel = (typeof SITE_DOC_ACCESS_LEVELS)[number];

export const SITE_DOC_EXTENSIONS = [
  'pdf',
  'jpg',
  'png',
  'webp',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'txt',
] as const;
export type SiteDocExtension = (typeof SITE_DOC_EXTENSIONS)[number];

export const SITE_DOC_MIME_BY_EXTENSION: Readonly<Record<SiteDocExtension, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
};

export const SITE_DOC_IMAGE_EXTENSIONS = ['jpg', 'png', 'webp'] as const;
export type SiteDocImageExtension = (typeof SITE_DOC_IMAGE_EXTENSIONS)[number];

/** Límite general del MVP. TXT y CSV tienen un límite inferior para inspección completa. */
export const SITE_DOC_MAX_BYTES = 25 * 1024 * 1024;
export const SITE_DOC_MAX_TEXT_BYTES = 5 * 1024 * 1024;

export type SiteDocRejectionCode =
  | 'empty_file'
  | 'file_too_large'
  | 'invalid_filename'
  | 'path_like_filename'
  | 'double_extension'
  | 'extension_not_allowed'
  | 'mime_mismatch'
  | 'signature_mismatch'
  | 'active_content'
  | 'office_package_invalid'
  | 'office_macro_or_embedding'
  | 'archive_not_allowed'
  | 'storage_failed';

export interface SiteDocValidationReport {
  validator: 'worker-immediate-signature-v1';
  extension: SiteDocExtension;
  declaredMime: string;
  detectedMime: string;
  checks: string[];
  officeKind: 'word' | 'spreadsheet' | 'presentation' | null;
  /** El antivirus profundo requiere infraestructura fuera del Worker/MVP. */
  deepAntivirusScan: 'not-performed-worker-mvp';
}

export interface SiteDocCategory {
  id: Id;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SiteDocVersion {
  id: Id;
  documentId: Id;
  version: number;
  fileAssetId: Id | null;
  originalName: string;
  extension: SiteDocExtension | null;
  declaredMime: string | null;
  detectedMime: string | null;
  sizeBytes: number;
  status: SiteDocStatus;
  validation: SiteDocValidationReport | null;
  rejectionCode: SiteDocRejectionCode | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: IsoDateTime;
  scannedAt: IsoDateTime | null;
  publishedAt: IsoDateTime | null;
}

export interface SiteDoc {
  id: Id;
  projectId: string;
  categoryId: Id | null;
  title: string;
  description: string | null;
  status: SiteDocStatus;
  accessLevel: SiteDocAccessLevel;
  downloadEnabled: boolean;
  currentVersionId: Id | null;
  metadata: Metadata;
  sortOrder: number;
  createdBy: string;
  publishedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SiteDocWithCurrentVersion extends SiteDoc {
  category: SiteDocCategory | null;
  currentVersion: SiteDocVersion | null;
}

export interface SiteDocsAdminLibrary {
  projectId: string;
  categories: SiteDocCategory[];
  documents: SiteDocWithCurrentVersion[];
}

export interface SiteDocPublicItem {
  id: Id;
  title: string;
  description: string | null;
  categoryId: Id | null;
  categoryName: string | null;
  categorySlug: string | null;
  metadata: Metadata;
  sortOrder: number;
  version: number;
  originalName: string;
  extension: SiteDocExtension;
  contentType: string;
  sizeBytes: number;
  publishedAt: IsoDateTime;
  downloadUrl: string;
  previewUrl: string | null;
}

export interface SiteDocsPublicLibrary {
  projectId: string;
  categories: Array<Pick<SiteDocCategory, 'id' | 'name' | 'slug' | 'description' | 'sortOrder'>>;
  documents: SiteDocPublicItem[];
}
