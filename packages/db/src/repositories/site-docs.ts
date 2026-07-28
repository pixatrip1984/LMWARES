import type { D1Database } from '@cloudflare/workers-types';
import { AppError, type Metadata } from '@starter/domain';
import { boolFromDb, boolToDb, newId, nowIso, nullable, parseJson } from '../helpers';

type SiteDocStatus =
  | 'uploading'
  | 'quarantine'
  | 'scanning'
  | 'clean'
  | 'rejected'
  | 'published';
type SiteDocAccessLevel = 'public' | 'private';
type SiteDocExtension =
  | 'pdf'
  | 'jpg'
  | 'png'
  | 'webp'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'csv'
  | 'txt';
type SiteDocRejectionCode =
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

interface SiteDocValidationReport {
  validator: 'worker-immediate-signature-v1';
  extension: SiteDocExtension;
  declaredMime: string;
  detectedMime: string;
  checks: string[];
  officeKind: 'word' | 'spreadsheet' | 'presentation' | null;
  deepAntivirusScan: 'not-performed-worker-mvp';
}

interface SiteDocCategory {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SiteDocVersion {
  id: string;
  documentId: string;
  version: number;
  fileAssetId: string | null;
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
  createdAt: string;
  scannedAt: string | null;
  publishedAt: string | null;
}

interface SiteDoc {
  id: string;
  projectId: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  status: SiteDocStatus;
  accessLevel: SiteDocAccessLevel;
  downloadEnabled: boolean;
  currentVersionId: string | null;
  metadata: Metadata;
  sortOrder: number;
  createdBy: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SiteDocWithCurrentVersion extends SiteDoc {
  category: SiteDocCategory | null;
  currentVersion: SiteDocVersion | null;
}

interface SiteDocsAdminLibrary {
  projectId: string;
  categories: SiteDocCategory[];
  documents: SiteDocWithCurrentVersion[];
}

interface SiteDocCategoryRow {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface SiteDocRow {
  id: string;
  project_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  status: string;
  access_level: string;
  download_enabled: number;
  current_version_id: string | null;
  metadata: string;
  sort_order: number;
  created_by: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SiteDocVersionRow {
  id: string;
  document_id: string;
  version: number;
  file_asset_id: string | null;
  original_name: string;
  extension: string | null;
  declared_mime: string | null;
  detected_mime: string | null;
  size_bytes: number;
  status: string;
  validation: string;
  rejection_code: string | null;
  rejection_reason: string | null;
  created_by: string;
  created_at: string;
  scanned_at: string | null;
  published_at: string | null;
}

interface SiteDocJoinRow extends SiteDocRow {
  category_join_id: string | null;
  category_project_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  category_description: string | null;
  category_sort_order: number | null;
  category_created_by: string | null;
  category_created_at: string | null;
  category_updated_at: string | null;
  version_join_id: string | null;
  version_document_id: string | null;
  version_number: number | null;
  version_file_asset_id: string | null;
  version_original_name: string | null;
  version_extension: string | null;
  version_declared_mime: string | null;
  version_detected_mime: string | null;
  version_size_bytes: number | null;
  version_status: string | null;
  version_validation: string | null;
  version_rejection_code: string | null;
  version_rejection_reason: string | null;
  version_created_by: string | null;
  version_created_at: string | null;
  version_scanned_at: string | null;
  version_published_at: string | null;
}

interface StoredFileRow extends SiteDocJoinRow {
  storage_key: string;
  storage_content_type: string;
  storage_size_bytes: number;
}

export interface CreateSiteDocCategoryData {
  projectId: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  createdBy: string;
}

export interface UpdateSiteDocCategoryData {
  name?: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
}

export interface BeginSiteDocUploadData {
  documentId: string;
  versionId: string;
  projectId: string;
  title: string;
  description?: string | null;
  categoryId?: string | null;
  accessLevel: SiteDocAccessLevel;
  downloadEnabled: boolean;
  metadata: Metadata;
  sortOrder: number;
  originalName: string;
  extension: SiteDocExtension | null;
  declaredMime: string | null;
  sizeBytes: number;
  createdBy: string;
}

export interface BeginSiteDocVersionData {
  versionId: string;
  projectId: string;
  documentId: string;
  originalName: string;
  extension: SiteDocExtension | null;
  declaredMime: string | null;
  sizeBytes: number;
  createdBy: string;
}

export interface CompleteSiteDocUploadData {
  projectId: string;
  documentId: string;
  versionId: string;
  fileAssetId: string;
  extension: SiteDocExtension;
  declaredMime: string;
  detectedMime: string;
  validation: SiteDocValidationReport;
}

export interface UpdateSiteDocData {
  title?: string;
  description?: string | null;
  categoryId?: string | null;
  accessLevel?: SiteDocAccessLevel;
  downloadEnabled?: boolean;
  metadata?: Metadata;
  sortOrder?: number;
}

export interface SiteDocStoredFile {
  document: SiteDocWithCurrentVersion;
  version: SiteDocVersion;
  key: string;
  contentType: string;
  sizeBytes: number;
}

export class SiteDocsRepository {
  constructor(private readonly db: D1Database) {}

  async assertProject(projectId: string): Promise<void> {
    const row = await this.db
      .prepare(`SELECT id FROM lmwares_projects WHERE id = ?`)
      .bind(projectId)
      .first<{ id: string }>();
    if (!row) throw AppError.notFound('Proyecto');
  }

  async listAdminLibrary(projectId: string): Promise<SiteDocsAdminLibrary> {
    await this.assertProject(projectId);
    const [categories, documents] = await Promise.all([
      this.listCategories(projectId),
      this.listDocuments(projectId),
    ]);
    return { projectId, categories, documents };
  }

  async listCategories(projectId: string): Promise<SiteDocCategory[]> {
    const { results } = await this.db
      .prepare(
        `SELECT *
         FROM lmwares_doc_categories
         WHERE project_id = ?
         ORDER BY sort_order ASC, name ASC`,
      )
      .bind(projectId)
      .all<SiteDocCategoryRow>();
    return results.map(mapCategory);
  }

  async createCategory(data: CreateSiteDocCategoryData): Promise<SiteDocCategory> {
    await this.assertProject(data.projectId);
    const id = newId();
    const now = nowIso();
    try {
      await this.db
        .prepare(
          `INSERT INTO lmwares_doc_categories
            (id, project_id, name, slug, description, sort_order, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          data.projectId,
          data.name,
          data.slug,
          nullable(data.description),
          data.sortOrder,
          data.createdBy,
          now,
          now,
        )
        .run();
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AppError('conflict', `Ya existe la categoría "${data.slug}".`);
      }
      throw error;
    }
    return (await this.getCategory(data.projectId, id))!;
  }

  async updateCategory(
    projectId: string,
    categoryId: string,
    patch: UpdateSiteDocCategoryData,
  ): Promise<SiteDocCategory | null> {
    const existing = await this.getCategory(projectId, categoryId);
    if (!existing) return null;
    try {
      await this.db
        .prepare(
          `UPDATE lmwares_doc_categories
           SET name = ?, slug = ?, description = ?, sort_order = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(
          patch.name ?? existing.name,
          patch.slug ?? existing.slug,
          patch.description === undefined ? existing.description : patch.description,
          patch.sortOrder ?? existing.sortOrder,
          nowIso(),
          categoryId,
          projectId,
        )
        .run();
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AppError('conflict', `Ya existe la categoría "${patch.slug}".`);
      }
      throw error;
    }
    return this.getCategory(projectId, categoryId);
  }

  async deleteCategory(projectId: string, categoryId: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM lmwares_doc_categories WHERE id = ? AND project_id = ?`)
      .bind(categoryId, projectId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async beginDocumentUpload(data: BeginSiteDocUploadData): Promise<SiteDocVersion> {
    await this.assertProject(data.projectId);
    await this.assertCategory(data.projectId, data.categoryId ?? null);
    const now = nowIso();

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO lmwares_docs (
            id, project_id, category_id, title, description, status, access_level,
            download_enabled, current_version_id, metadata, sort_order, created_by,
            published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'uploading', ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          data.documentId,
          data.projectId,
          nullable(data.categoryId),
          data.title,
          nullable(data.description),
          data.accessLevel,
          boolToDb(data.downloadEnabled),
          JSON.stringify(data.metadata),
          data.sortOrder,
          data.createdBy,
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO lmwares_doc_versions (
            id, document_id, version, file_asset_id, original_name, extension,
            declared_mime, detected_mime, size_bytes, status, validation,
            rejection_code, rejection_reason, created_by, created_at, scanned_at, published_at
          ) VALUES (?, ?, 1, NULL, ?, ?, ?, NULL, ?, 'uploading', '{}', NULL, NULL, ?, ?, NULL, NULL)`,
        )
        .bind(
          data.versionId,
          data.documentId,
          data.originalName,
          nullable(data.extension),
          nullable(data.declaredMime),
          data.sizeBytes,
          data.createdBy,
          now,
        ),
      this.db
        .prepare(
          `UPDATE lmwares_docs
           SET current_version_id = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(data.versionId, data.documentId, data.projectId),
    ]);

    return (await this.getVersion(data.projectId, data.documentId, data.versionId))!;
  }

  async beginVersionUpload(data: BeginSiteDocVersionData): Promise<SiteDocVersion> {
    const document = await this.getDocument(data.projectId, data.documentId);
    if (!document) throw AppError.notFound('Documento');
    const nextVersion = await this.nextVersion(data.documentId);
    const now = nowIso();
    try {
      await this.db
        .prepare(
          `INSERT INTO lmwares_doc_versions (
            id, document_id, version, file_asset_id, original_name, extension,
            declared_mime, detected_mime, size_bytes, status, validation,
            rejection_code, rejection_reason, created_by, created_at, scanned_at, published_at
          ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, 'uploading', '{}', NULL, NULL, ?, ?, NULL, NULL)`,
        )
        .bind(
          data.versionId,
          data.documentId,
          nextVersion,
          data.originalName,
          nullable(data.extension),
          nullable(data.declaredMime),
          data.sizeBytes,
          data.createdBy,
          now,
        )
        .run();
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AppError('conflict', 'Otra carga creó esta versión; vuelve a intentarlo.');
      }
      throw error;
    }
    return (await this.getVersion(data.projectId, data.documentId, data.versionId))!;
  }

  async setVersionStatus(
    projectId: string,
    documentId: string,
    versionId: string,
    status: Extract<SiteDocStatus, 'quarantine' | 'scanning'>,
  ): Promise<SiteDocVersion> {
    const now = nowIso();
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_doc_versions
           SET status = ?, scanned_at = CASE WHEN ? = 'scanning' THEN ? ELSE scanned_at END
           WHERE id = ? AND document_id = ?
             AND EXISTS (
               SELECT 1 FROM lmwares_docs
               WHERE id = ? AND project_id = ?
             )`,
        )
        .bind(status, status, now, versionId, documentId, documentId, projectId),
      this.db
        .prepare(
          `UPDATE lmwares_docs
           SET status = ?, updated_at = ?
           WHERE id = ? AND project_id = ? AND current_version_id = ?`,
        )
        .bind(status, now, documentId, projectId, versionId),
    ]);
    if ((result[0]?.meta.changes ?? 0) === 0) throw AppError.notFound('Versión');
    return (await this.getVersion(projectId, documentId, versionId))!;
  }

  async rejectVersion(
    projectId: string,
    documentId: string,
    versionId: string,
    code: SiteDocRejectionCode,
    reason: string,
  ): Promise<SiteDocVersion> {
    const now = nowIso();
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_doc_versions
           SET status = 'rejected', rejection_code = ?, rejection_reason = ?, scanned_at = ?
           WHERE id = ? AND document_id = ?
             AND EXISTS (
               SELECT 1 FROM lmwares_docs
               WHERE id = ? AND project_id = ?
             )`,
        )
        .bind(code, reason, now, versionId, documentId, documentId, projectId),
      this.db
        .prepare(
          `UPDATE lmwares_docs
           SET status = 'rejected', updated_at = ?
           WHERE id = ? AND project_id = ? AND current_version_id = ?`,
        )
        .bind(now, documentId, projectId, versionId),
    ]);
    if ((result[0]?.meta.changes ?? 0) === 0) throw AppError.notFound('Versión');
    return (await this.getVersion(projectId, documentId, versionId))!;
  }

  async completeUpload(data: CompleteSiteDocUploadData): Promise<SiteDocWithCurrentVersion> {
    const now = nowIso();
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_doc_versions
           SET file_asset_id = ?, extension = ?, declared_mime = ?, detected_mime = ?,
               status = 'clean', validation = ?, rejection_code = NULL, rejection_reason = NULL,
               scanned_at = ?
           WHERE id = ? AND document_id = ?
             AND status = 'scanning'
             AND EXISTS (
               SELECT 1 FROM lmwares_docs
               WHERE id = ? AND project_id = ?
             )`,
        )
        .bind(
          data.fileAssetId,
          data.extension,
          data.declaredMime,
          data.detectedMime,
          JSON.stringify(data.validation),
          now,
          data.versionId,
          data.documentId,
          data.documentId,
          data.projectId,
        ),
      this.db
        .prepare(
          `UPDATE lmwares_docs
           SET current_version_id = ?, status = 'clean', published_at = NULL, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(data.versionId, now, data.documentId, data.projectId),
    ]);
    if ((result[0]?.meta.changes ?? 0) === 0) {
      throw new AppError('conflict', 'La versión ya no está lista para completar la carga.');
    }
    return (await this.getDocument(data.projectId, data.documentId))!;
  }

  async updateDocument(
    projectId: string,
    documentId: string,
    patch: UpdateSiteDocData,
  ): Promise<SiteDocWithCurrentVersion | null> {
    const existing = await this.getDocument(projectId, documentId);
    if (!existing) return null;
    const categoryId = patch.categoryId === undefined ? existing.categoryId : patch.categoryId;
    await this.assertCategory(projectId, categoryId);

    await this.db
      .prepare(
        `UPDATE lmwares_docs
         SET category_id = ?, title = ?, description = ?, access_level = ?,
             download_enabled = ?, metadata = ?, sort_order = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      )
      .bind(
        nullable(categoryId),
        patch.title ?? existing.title,
        patch.description === undefined ? existing.description : patch.description,
        patch.accessLevel ?? existing.accessLevel,
        boolToDb(patch.downloadEnabled ?? existing.downloadEnabled),
        JSON.stringify(patch.metadata ?? existing.metadata),
        patch.sortOrder ?? existing.sortOrder,
        nowIso(),
        documentId,
        projectId,
      )
      .run();
    return this.getDocument(projectId, documentId);
  }

  async publishDocument(projectId: string, documentId: string): Promise<SiteDocWithCurrentVersion> {
    const document = await this.getDocument(projectId, documentId);
    if (!document) throw AppError.notFound('Documento');
    const version = document.currentVersion;
    if (
      !version ||
      !version.fileAssetId ||
      (version.status !== 'clean' && version.status !== 'published')
    ) {
      throw new AppError(
        'conflict',
        'Solo se puede publicar una versión vigente con validación inmediata clean.',
      );
    }
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_doc_versions
           SET status = 'published', published_at = ?
           WHERE id = ? AND document_id = ?`,
        )
        .bind(now, version.id, documentId),
      this.db
        .prepare(
          `UPDATE lmwares_docs
           SET status = 'published', published_at = ?, updated_at = ?
           WHERE id = ? AND project_id = ? AND current_version_id = ?`,
        )
        .bind(now, now, documentId, projectId, version.id),
    ]);
    return (await this.getDocument(projectId, documentId))!;
  }

  async unpublishDocument(
    projectId: string,
    documentId: string,
  ): Promise<SiteDocWithCurrentVersion> {
    const document = await this.getDocument(projectId, documentId);
    if (!document) throw AppError.notFound('Documento');
    const version = document.currentVersion;
    if (!version || document.status !== 'published') {
      throw new AppError('conflict', 'El documento no está publicado.');
    }
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_doc_versions
           SET status = 'clean', published_at = NULL
           WHERE id = ? AND document_id = ?`,
        )
        .bind(version.id, documentId),
      this.db
        .prepare(
          `UPDATE lmwares_docs
           SET status = 'clean', published_at = NULL, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(now, documentId, projectId),
    ]);
    return (await this.getDocument(projectId, documentId))!;
  }

  async listVersions(projectId: string, documentId: string): Promise<SiteDocVersion[]> {
    const document = await this.getDocument(projectId, documentId);
    if (!document) throw AppError.notFound('Documento');
    const { results } = await this.db
      .prepare(
        `SELECT *
         FROM lmwares_doc_versions
         WHERE document_id = ?
         ORDER BY version DESC`,
      )
      .bind(documentId)
      .all<SiteDocVersionRow>();
    return results.map(mapVersion);
  }

  async getDocument(
    projectId: string,
    documentId: string,
  ): Promise<SiteDocWithCurrentVersion | null> {
    const row = await this.db
      .prepare(`${documentJoinSql()} WHERE d.project_id = ? AND d.id = ?`)
      .bind(projectId, documentId)
      .first<SiteDocJoinRow>();
    return row ? mapDocumentJoin(row) : null;
  }

  async getVersion(
    projectId: string,
    documentId: string,
    versionId: string,
  ): Promise<SiteDocVersion | null> {
    const row = await this.db
      .prepare(
        `SELECT v.*
         FROM lmwares_doc_versions v
         INNER JOIN lmwares_docs d ON d.id = v.document_id
         WHERE d.project_id = ? AND d.id = ? AND v.id = ?`,
      )
      .bind(projectId, documentId, versionId)
      .first<SiteDocVersionRow>();
    return row ? mapVersion(row) : null;
  }

  async getAdminPreviewFile(
    projectId: string,
    documentId: string,
    versionId: string,
  ): Promise<SiteDocStoredFile | null> {
    const row = await this.db
      .prepare(
        `${storedFileJoinSql()}
         WHERE d.project_id = ? AND d.id = ? AND v.id = ?
           AND v.status IN ('clean', 'published')`,
      )
      .bind(projectId, documentId, versionId)
      .first<StoredFileRow>();
    return row ? mapStoredFile(row) : null;
  }

  async listPublished(projectId: string): Promise<SiteDocStoredFile[]> {
    const { results } = await this.db
      .prepare(
        `${storedFileJoinSql()}
         WHERE d.project_id = ?
           AND d.status = 'published'
           AND d.access_level = 'public'
           AND d.download_enabled = 1
           AND v.status = 'published'
         ORDER BY COALESCE(c.sort_order, 2147483647), c.name, d.sort_order, d.title`,
      )
      .bind(projectId)
      .all<StoredFileRow>();
    return results.map(mapStoredFile);
  }

  async getPublishedFile(projectId: string, documentId: string): Promise<SiteDocStoredFile | null> {
    const row = await this.db
      .prepare(
        `${storedFileJoinSql()}
         WHERE d.project_id = ? AND d.id = ?
           AND d.status = 'published'
           AND d.access_level = 'public'
           AND d.download_enabled = 1
           AND v.status = 'published'`,
      )
      .bind(projectId, documentId)
      .first<StoredFileRow>();
    return row ? mapStoredFile(row) : null;
  }

  private async listDocuments(projectId: string): Promise<SiteDocWithCurrentVersion[]> {
    const { results } = await this.db
      .prepare(
        `${documentJoinSql()}
         WHERE d.project_id = ?
         ORDER BY COALESCE(c.sort_order, 2147483647), c.name, d.sort_order, d.updated_at DESC`,
      )
      .bind(projectId)
      .all<SiteDocJoinRow>();
    return results.map(mapDocumentJoin);
  }

  private async getCategory(
    projectId: string,
    categoryId: string,
  ): Promise<SiteDocCategory | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmwares_doc_categories WHERE project_id = ? AND id = ?`)
      .bind(projectId, categoryId)
      .first<SiteDocCategoryRow>();
    return row ? mapCategory(row) : null;
  }

  private async assertCategory(projectId: string, categoryId: string | null): Promise<void> {
    if (!categoryId) return;
    if (!(await this.getCategory(projectId, categoryId))) {
      throw new AppError('validation_error', 'La categoría no pertenece al proyecto seleccionado.');
    }
  }

  private async nextVersion(documentId: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM lmwares_doc_versions
         WHERE document_id = ?`,
      )
      .bind(documentId)
      .first<{ next_version: number }>();
    return row?.next_version ?? 1;
  }
}

function documentJoinSql(): string {
  return `
    SELECT
      d.*,
      c.id AS category_join_id,
      c.project_id AS category_project_id,
      c.name AS category_name,
      c.slug AS category_slug,
      c.description AS category_description,
      c.sort_order AS category_sort_order,
      c.created_by AS category_created_by,
      c.created_at AS category_created_at,
      c.updated_at AS category_updated_at,
      v.id AS version_join_id,
      v.document_id AS version_document_id,
      v.version AS version_number,
      v.file_asset_id AS version_file_asset_id,
      v.original_name AS version_original_name,
      v.extension AS version_extension,
      v.declared_mime AS version_declared_mime,
      v.detected_mime AS version_detected_mime,
      v.size_bytes AS version_size_bytes,
      v.status AS version_status,
      v.validation AS version_validation,
      v.rejection_code AS version_rejection_code,
      v.rejection_reason AS version_rejection_reason,
      v.created_by AS version_created_by,
      v.created_at AS version_created_at,
      v.scanned_at AS version_scanned_at,
      v.published_at AS version_published_at
    FROM lmwares_docs d
    LEFT JOIN lmwares_doc_categories c ON c.id = d.category_id
    LEFT JOIN lmwares_doc_versions v ON v.id = d.current_version_id`;
}

function storedFileJoinSql(): string {
  return `${documentJoinSql().replace(
    'SELECT',
    `SELECT
      fa.key AS storage_key,
      fa.content_type AS storage_content_type,
      fa.size_bytes AS storage_size_bytes,`,
  )}
    INNER JOIN file_assets fa ON fa.id = v.file_asset_id`;
}

function mapCategory(row: SiteDocCategoryRow): SiteDocCategory {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: SiteDocRow): SiteDoc {
  return {
    id: row.id,
    projectId: row.project_id,
    categoryId: row.category_id,
    title: row.title,
    description: row.description,
    status: row.status as SiteDocStatus,
    accessLevel: row.access_level as SiteDocAccessLevel,
    downloadEnabled: boolFromDb(row.download_enabled),
    currentVersionId: row.current_version_id,
    metadata: parseJson<Metadata>(row.metadata, {}),
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: SiteDocVersionRow): SiteDocVersion {
  const validation = parseJson<SiteDocValidationReport | null>(row.validation, null);
  return {
    id: row.id,
    documentId: row.document_id,
    version: row.version,
    fileAssetId: row.file_asset_id,
    originalName: row.original_name,
    extension: row.extension as SiteDocExtension | null,
    declaredMime: row.declared_mime,
    detectedMime: row.detected_mime,
    sizeBytes: row.size_bytes,
    status: row.status as SiteDocStatus,
    validation: validation?.validator === 'worker-immediate-signature-v1' ? validation : null,
    rejectionCode: row.rejection_code as SiteDocRejectionCode | null,
    rejectionReason: row.rejection_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    scannedAt: row.scanned_at,
    publishedAt: row.published_at,
  };
}

function mapDocumentJoin(row: SiteDocJoinRow): SiteDocWithCurrentVersion {
  const category =
    row.category_join_id &&
    row.category_project_id &&
    row.category_name &&
    row.category_slug &&
    row.category_created_by &&
    row.category_created_at &&
    row.category_updated_at
      ? mapCategory({
          id: row.category_join_id,
          project_id: row.category_project_id,
          name: row.category_name,
          slug: row.category_slug,
          description: row.category_description,
          sort_order: row.category_sort_order ?? 0,
          created_by: row.category_created_by,
          created_at: row.category_created_at,
          updated_at: row.category_updated_at,
        })
      : null;

  const currentVersion =
    row.version_join_id &&
    row.version_document_id &&
    row.version_original_name &&
    row.version_created_by &&
    row.version_created_at &&
    row.version_number !== null &&
    row.version_size_bytes !== null &&
    row.version_status
      ? mapVersion({
          id: row.version_join_id,
          document_id: row.version_document_id,
          version: row.version_number,
          file_asset_id: row.version_file_asset_id,
          original_name: row.version_original_name,
          extension: row.version_extension,
          declared_mime: row.version_declared_mime,
          detected_mime: row.version_detected_mime,
          size_bytes: row.version_size_bytes,
          status: row.version_status,
          validation: row.version_validation ?? '{}',
          rejection_code: row.version_rejection_code,
          rejection_reason: row.version_rejection_reason,
          created_by: row.version_created_by,
          created_at: row.version_created_at,
          scanned_at: row.version_scanned_at,
          published_at: row.version_published_at,
        })
      : null;

  return { ...mapDocument(row), category, currentVersion };
}

function mapStoredFile(row: StoredFileRow): SiteDocStoredFile {
  const document = mapDocumentJoin(row);
  if (!document.currentVersion) {
    throw new Error('Registro DOCS inconsistente: falta la versión vigente.');
  }
  return {
    document,
    version: document.currentVersion,
    key: row.storage_key,
    contentType: row.storage_content_type,
    sizeBytes: row.storage_size_bytes,
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}
