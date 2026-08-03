import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import { newId, nowIso, nullable } from '../helpers';

export type SiteGalleryStatus = 'draft' | 'published';

export interface SiteGalleryAlbumRecord {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: SiteGalleryStatus;
  coverImageId: string | null;
  sortOrder: number;
  publishedAt: string | null;
  publishedRevisionAt: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteGalleryStoredImage {
  id: string;
  albumId: string;
  fileAssetId: string;
  alt: string | null;
  position: number;
  width: number;
  height: number;
  createdAt: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  checksum: string | null;
}

export interface SiteGalleryAlbumSummaryRecord extends SiteGalleryAlbumRecord {
  imageCount: number;
  coverImage: SiteGalleryStoredImage | null;
}

export interface SiteGalleryAlbumDetailRecord extends SiteGalleryAlbumRecord {
  images: SiteGalleryStoredImage[];
}

export interface SiteGalleryPublicationResult {
  album: SiteGalleryAlbumDetailRecord;
  orphanedImages: SiteGalleryStoredImage[];
}

export interface SiteGalleryImageRemoval {
  image: SiteGalleryStoredImage;
  deleteObject: boolean;
}

export interface SiteGalleryAlbumFields {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  sortOrder: number;
}

export type UpdateSiteGalleryAlbumFields = Partial<SiteGalleryAlbumFields>;

export interface SiteGalleryAuditData {
  actorId: string;
  action: string;
  projectId: string;
  albumId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

interface AlbumRow {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  cover_image_id: string | null;
  sort_order: number;
  published_at: string | null;
  published_revision_at: string | null;
  published_source_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StoredImageRow {
  id: string;
  album_id: string;
  file_asset_id: string;
  alt: string | null;
  position: number;
  width: number;
  height: number;
  created_at: string;
  key: string;
  content_type: string;
  size_bytes: number;
  checksum: string | null;
}

interface AlbumSummaryRow extends AlbumRow {
  image_count: number;
  cover_id: string | null;
  cover_album_id: string | null;
  cover_file_asset_id: string | null;
  cover_alt: string | null;
  cover_position: number | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_created_at: string | null;
  cover_key: string | null;
  cover_content_type: string | null;
  cover_size_bytes: number | null;
  cover_checksum: string | null;
}

const SUMMARY_SELECT = `
  SELECT
    a.*,
    publication.revision_at AS published_revision_at,
    publication.updated_at AS published_source_updated_at,
    (SELECT COUNT(*) FROM site_gallery_images image_count
      WHERE image_count.album_id = a.id) AS image_count,
    cover.id AS cover_id,
    cover.album_id AS cover_album_id,
    cover.file_asset_id AS cover_file_asset_id,
    cover.alt AS cover_alt,
    cover.position AS cover_position,
    cover.width AS cover_width,
    cover.height AS cover_height,
    cover.created_at AS cover_created_at,
    cover_asset.key AS cover_key,
    cover_asset.content_type AS cover_content_type,
    cover_asset.size_bytes AS cover_size_bytes,
    cover_asset.checksum AS cover_checksum
  FROM site_gallery_albums a
  LEFT JOIN site_gallery_publications publication
    ON publication.album_id = a.id
  LEFT JOIN site_gallery_images cover ON cover.id = a.cover_image_id
  LEFT JOIN file_assets cover_asset ON cover_asset.id = cover.file_asset_id`;

const PUBLISHED_ALBUM_SELECT = `
  SELECT
    publication.album_id AS id,
    publication.project_id,
    publication.slug,
    publication.title,
    publication.description,
    publication.category,
    'published' AS status,
    publication.cover_image_id,
    publication.sort_order,
    publication.published_at,
    publication.revision_at AS published_revision_at,
    publication.updated_at AS published_source_updated_at,
    publication.created_at,
    publication.updated_at
  FROM site_gallery_publications publication`;

const PUBLISHED_SUMMARY_SELECT = `
  SELECT
    publication.album_id AS id,
    publication.project_id,
    publication.slug,
    publication.title,
    publication.description,
    publication.category,
    'published' AS status,
    publication.cover_image_id,
    publication.sort_order,
    publication.published_at,
    publication.revision_at AS published_revision_at,
    publication.updated_at AS published_source_updated_at,
    publication.created_at,
    publication.updated_at,
    (SELECT COUNT(*) FROM site_gallery_publication_images image_count
      WHERE image_count.album_id = publication.album_id) AS image_count,
    cover.image_id AS cover_id,
    cover.album_id AS cover_album_id,
    cover.file_asset_id AS cover_file_asset_id,
    cover.alt AS cover_alt,
    cover.position AS cover_position,
    cover.width AS cover_width,
    cover.height AS cover_height,
    cover.created_at AS cover_created_at,
    cover_asset.key AS cover_key,
    cover_asset.content_type AS cover_content_type,
    cover_asset.size_bytes AS cover_size_bytes,
    cover_asset.checksum AS cover_checksum
  FROM site_gallery_publications publication
  LEFT JOIN site_gallery_publication_images cover
    ON cover.album_id = publication.album_id
   AND cover.image_id = publication.cover_image_id
  LEFT JOIN file_assets cover_asset ON cover_asset.id = cover.file_asset_id`;

export class SiteGalleryRepository {
  constructor(private readonly db: D1Database) {}

  async projectExists(projectId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM lmwares_projects WHERE id = ?`)
      .bind(projectId)
      .first<{ id: string }>();
    return row !== null;
  }

  async listAdmin(projectId: string): Promise<SiteGalleryAlbumSummaryRecord[]> {
    const { results } = await this.db
      .prepare(
        `${SUMMARY_SELECT}
         WHERE a.project_id = ?
         ORDER BY a.sort_order ASC, a.updated_at DESC, a.title ASC`,
      )
      .bind(projectId)
      .all<AlbumSummaryRow>();
    return results.map(mapAlbumSummary);
  }

  async listPublished(
    projectId: string,
    query?: string,
  ): Promise<SiteGalleryAlbumSummaryRecord[]> {
    const q = query?.trim();
    const statement = q
      ? this.db
          .prepare(
            `${PUBLISHED_SUMMARY_SELECT}
             WHERE publication.project_id = ?
               AND (publication.title LIKE ? OR publication.category LIKE ?
                    OR publication.description LIKE ?)
             ORDER BY publication.sort_order ASC,
               publication.published_at DESC, publication.title ASC`,
          )
          .bind(projectId, `%${q}%`, `%${q}%`, `%${q}%`)
      : this.db
          .prepare(
            `${PUBLISHED_SUMMARY_SELECT}
             WHERE publication.project_id = ?
             ORDER BY publication.sort_order ASC,
               publication.published_at DESC, publication.title ASC`,
          )
          .bind(projectId);
    const { results } = await statement.all<AlbumSummaryRow>();
    return results.map(mapAlbumSummary);
  }

  async getById(
    projectId: string,
    albumId: string,
  ): Promise<SiteGalleryAlbumRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           album.*,
           publication.revision_at AS published_revision_at,
           publication.updated_at AS published_source_updated_at
         FROM site_gallery_albums album
         LEFT JOIN site_gallery_publications publication
           ON publication.album_id = album.id
         WHERE album.id = ? AND album.project_id = ?`,
      )
      .bind(albumId, projectId)
      .first<AlbumRow>();
    return row ? mapAlbum(row) : null;
  }

  async getDetail(
    projectId: string,
    albumId: string,
  ): Promise<SiteGalleryAlbumDetailRecord | null> {
    const album = await this.getById(projectId, albumId);
    if (!album) return null;
    return { ...album, images: await this.listImages(albumId) };
  }

  async getPublishedBySlug(
    projectId: string,
    slug: string,
  ): Promise<SiteGalleryAlbumDetailRecord | null> {
    const row = await this.db
      .prepare(
        `${PUBLISHED_ALBUM_SELECT}
         WHERE publication.project_id = ? AND publication.slug = ?`,
      )
      .bind(projectId, slug)
      .first<AlbumRow>();
    if (!row) return null;
    const album = mapAlbum(row);
    return { ...album, images: await this.listPublishedImages(album.id) };
  }

  async slugExists(
    projectId: string,
    slug: string,
    exceptAlbumId?: string,
  ): Promise<boolean> {
    const row = exceptAlbumId
      ? await this.db
          .prepare(
            `SELECT id FROM site_gallery_albums
             WHERE project_id = ? AND slug = ? AND id <> ?`,
          )
          .bind(projectId, slug, exceptAlbumId)
          .first<{ id: string }>()
      : await this.db
          .prepare(
            `SELECT id FROM site_gallery_albums
             WHERE project_id = ? AND slug = ?`,
          )
          .bind(projectId, slug)
          .first<{ id: string }>();
    return row !== null;
  }

  async createAlbum(
    projectId: string,
    data: SiteGalleryAlbumFields,
    changedBy: string,
  ): Promise<SiteGalleryAlbumDetailRecord> {
    const id = newId();
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO site_gallery_albums
            (id, project_id, slug, title, description, category, status,
             cover_image_id, sort_order, published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', NULL, ?, NULL, ?, ?)`,
        )
        .bind(
          id,
          projectId,
          data.slug,
          data.title,
          nullable(data.description),
          data.category,
          data.sortOrder,
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO status_history
            (id, entity_type, entity_id, from_status, to_status, changed_by, reason, created_at)
           VALUES (?, 'site_gallery_album', ?, NULL, 'draft', ?, 'Álbum creado', ?)`,
        )
        .bind(newId(), id, changedBy, now),
    ]);
    return (await this.getDetail(projectId, id))!;
  }

  async updateAlbum(
    projectId: string,
    albumId: string,
    patch: UpdateSiteGalleryAlbumFields,
  ): Promise<SiteGalleryAlbumDetailRecord | null> {
    const existing = await this.getById(projectId, albumId);
    if (!existing) return null;
    const next: SiteGalleryAlbumFields = {
      slug: patch.slug ?? existing.slug,
      title: patch.title ?? existing.title,
      description:
        patch.description === undefined ? existing.description : patch.description,
      category: patch.category ?? existing.category,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
    };
    await this.db
      .prepare(
        `UPDATE site_gallery_albums SET
          slug = ?, title = ?, description = ?, category = ?,
          sort_order = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      )
      .bind(
        next.slug,
        next.title,
        nullable(next.description),
        next.category,
        next.sortOrder,
        nowIso(),
        albumId,
        projectId,
      )
      .run();
    return this.getDetail(projectId, albumId);
  }

  async saveDraft(
    projectId: string,
    albumId: string,
    changedBy: string,
    reason?: string | null,
  ): Promise<SiteGalleryAlbumDetailRecord | null> {
    const existing = await this.getDetail(projectId, albumId);
    if (!existing) return null;
    if (existing.status === 'draft' || existing.publishedRevisionAt) {
      return existing;
    }

    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE site_gallery_albums
           SET status = 'draft', updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(now, albumId, projectId),
      this.db
        .prepare(
          `INSERT INTO status_history
            (id, entity_type, entity_id, from_status, to_status, changed_by, reason, created_at)
           VALUES (?, 'site_gallery_album', ?, ?, 'draft', ?, ?, ?)`,
        )
        .bind(
          newId(),
          albumId,
          existing.status,
          changedBy,
          nullable(reason),
          now,
        ),
    ]);
    return this.getDetail(projectId, albumId);
  }

  async publishAlbum(
    projectId: string,
    albumId: string,
    changedBy: string,
    reason?: string | null,
  ): Promise<SiteGalleryPublicationResult | null> {
    const existing = await this.getDetail(projectId, albumId);
    if (!existing) return null;

    const previousImages = await this.listPublishedImages(albumId);
    const now = nowIso();
    const publishedAt = existing.publishedAt ?? now;
    const coverImageId = existing.coverImageId ?? existing.images[0]?.id ?? null;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `DELETE FROM site_gallery_publication_images WHERE album_id = ?`,
        )
        .bind(albumId),
      this.db
        .prepare(
          `INSERT INTO site_gallery_publications (
             album_id, project_id, slug, title, description, category,
             cover_image_id, sort_order, published_at, created_at, updated_at,
             revision_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(album_id) DO UPDATE SET
             project_id = excluded.project_id,
             slug = excluded.slug,
             title = excluded.title,
             description = excluded.description,
             category = excluded.category,
             cover_image_id = excluded.cover_image_id,
             sort_order = excluded.sort_order,
             published_at = excluded.published_at,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             revision_at = excluded.revision_at`,
        )
        .bind(
          albumId,
          projectId,
          existing.slug,
          existing.title,
          nullable(existing.description),
          existing.category,
          nullable(coverImageId),
          existing.sortOrder,
          publishedAt,
          existing.createdAt,
          now,
          now,
        ),
      ...existing.images.map((image) =>
        this.db
          .prepare(
            `INSERT INTO site_gallery_publication_images (
               album_id, image_id, file_asset_id, alt, position, width, height,
               created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            albumId,
            image.id,
            image.fileAssetId,
            nullable(image.alt),
            image.position,
            image.width,
            image.height,
            image.createdAt,
          ),
      ),
      this.db
        .prepare(
          `UPDATE site_gallery_albums
           SET status = 'published', cover_image_id = ?, published_at = ?,
             updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(nullable(coverImageId), publishedAt, now, albumId, projectId),
    ];

    if (existing.status !== 'published') {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO status_history
              (id, entity_type, entity_id, from_status, to_status, changed_by, reason, created_at)
             VALUES (?, 'site_gallery_album', ?, ?, 'published', ?, ?, ?)`,
          )
          .bind(
            newId(),
            albumId,
            existing.status,
            changedBy,
            nullable(reason),
            now,
          ),
      );
    }

    await this.db.batch(statements);

    const currentFileAssetIds = new Set(
      existing.images.map((image) => image.fileAssetId),
    );
    const staleImages = previousImages.filter(
      (image) => !currentFileAssetIds.has(image.fileAssetId),
    );
    const orphanedImages = await this.deleteUnreferencedAssets(staleImages);
    const album = await this.getDetail(projectId, albumId);
    if (!album) return null;
    return { album, orphanedImages };
  }

  async unpublishAlbum(
    projectId: string,
    albumId: string,
    changedBy: string,
    reason?: string | null,
  ): Promise<SiteGalleryAlbumDetailRecord | null> {
    const existing = await this.getDetail(projectId, albumId);
    if (!existing) return null;
    if (!existing.publishedRevisionAt) return existing;

    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM site_gallery_publication_images WHERE album_id = ?`,
        )
        .bind(albumId),
      this.db
        .prepare(
          `DELETE FROM site_gallery_publications
           WHERE album_id = ? AND project_id = ?`,
        )
        .bind(albumId, projectId),
      this.db
        .prepare(
          `UPDATE site_gallery_albums
           SET status = 'draft', published_at = NULL, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(now, albumId, projectId),
      this.db
        .prepare(
          `INSERT INTO status_history
            (id, entity_type, entity_id, from_status, to_status, changed_by, reason, created_at)
           VALUES (?, 'site_gallery_album', ?, ?, 'draft', ?, ?, ?)`,
        )
        .bind(
          newId(),
          albumId,
          existing.status,
          changedBy,
          nullable(reason),
          now,
        ),
    ]);

    return this.getDetail(projectId, albumId);
  }

  async addImage(data: {
    projectId: string;
    albumId: string;
    key: string;
    bucket: string;
    contentType: string;
    sizeBytes: number;
    originalName: string | null;
    checksum: string;
    createdBy: string;
    alt: string | null;
    width: number;
    height: number;
  }): Promise<SiteGalleryStoredImage | null> {
    const album = await this.getById(data.projectId, data.albumId);
    if (!album) return null;

    const nextRow = await this.db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM site_gallery_images WHERE album_id = ?`,
      )
      .bind(data.albumId)
      .first<{ next_position: number }>();

    const fileAssetId = newId();
    const imageId = newId();
    const now = nowIso();
    const position = nextRow?.next_position ?? 0;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO file_assets
            (id, key, bucket, content_type, size_bytes, original_name,
             checksum, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          fileAssetId,
          data.key,
          data.bucket,
          data.contentType,
          data.sizeBytes,
          nullable(data.originalName),
          data.checksum,
          data.createdBy,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO site_gallery_images
            (id, album_id, file_asset_id, alt, position, width, height, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          imageId,
          data.albumId,
          fileAssetId,
          nullable(data.alt),
          position,
          data.width,
          data.height,
          now,
        ),
      this.db
        .prepare(
          `UPDATE site_gallery_albums
           SET cover_image_id = COALESCE(cover_image_id, ?), updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(imageId, now, data.albumId, data.projectId),
    ];
    await this.db.batch(statements);
    return this.getImage(data.projectId, data.albumId, imageId);
  }

  async getImage(
    projectId: string,
    albumId: string,
    imageId: string,
  ): Promise<SiteGalleryStoredImage | null> {
    const row = await this.db
      .prepare(
        `${IMAGE_SELECT}
         WHERE image.id = ? AND image.album_id = ?
           AND album.project_id = ?`,
      )
      .bind(imageId, albumId, projectId)
      .first<StoredImageRow>();
    return row ? mapStoredImage(row) : null;
  }

  async imageIsPublished(albumId: string, imageId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 AS present
         FROM site_gallery_publication_images
         WHERE album_id = ? AND image_id = ?`,
      )
      .bind(albumId, imageId)
      .first<{ present: number }>();
    return row !== null;
  }

  async updateImageAlt(
    projectId: string,
    albumId: string,
    imageId: string,
    alt: string | null,
  ): Promise<SiteGalleryStoredImage | null> {
    if (!(await this.getImage(projectId, albumId, imageId))) return null;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE site_gallery_images SET alt = ?
           WHERE id = ? AND album_id = ?`,
        )
        .bind(nullable(alt), imageId, albumId),
      this.db
        .prepare(
          `UPDATE site_gallery_albums SET updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(nowIso(), albumId, projectId),
    ]);
    return this.getImage(projectId, albumId, imageId);
  }

  async reorderImages(
    projectId: string,
    albumId: string,
    imageIds: string[],
  ): Promise<SiteGalleryAlbumDetailRecord | null> {
    const detail = await this.getDetail(projectId, albumId);
    if (!detail) return null;
    const currentIds = new Set(detail.images.map((image) => image.id));
    if (
      currentIds.size !== imageIds.length ||
      imageIds.some((imageId) => !currentIds.has(imageId))
    ) {
      return null;
    }

    const statements = imageIds.map((imageId, position) =>
      this.db
        .prepare(
          `UPDATE site_gallery_images SET position = ?
           WHERE id = ? AND album_id = ?`,
        )
        .bind(position, imageId, albumId),
    );
    statements.push(
      this.db
        .prepare(
          `UPDATE site_gallery_albums SET updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(nowIso(), albumId, projectId),
    );
    await this.db.batch(statements);
    return this.getDetail(projectId, albumId);
  }

  async setCover(
    projectId: string,
    albumId: string,
    imageId: string,
  ): Promise<SiteGalleryAlbumDetailRecord | null> {
    if (!(await this.getImage(projectId, albumId, imageId))) return null;
    await this.db
      .prepare(
        `UPDATE site_gallery_albums
         SET cover_image_id = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      )
      .bind(imageId, nowIso(), albumId, projectId)
      .run();
    return this.getDetail(projectId, albumId);
  }

  async removeImage(
    projectId: string,
    albumId: string,
    imageId: string,
  ): Promise<SiteGalleryImageRemoval | null> {
    const image = await this.getImage(projectId, albumId, imageId);
    if (!image) return null;
    const replacement = await this.db
      .prepare(
        `SELECT id FROM site_gallery_images
         WHERE album_id = ? AND id <> ?
         ORDER BY position ASC, created_at ASC LIMIT 1`,
      )
      .bind(albumId, imageId)
      .first<{ id: string }>();
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE site_gallery_albums
           SET cover_image_id =
             CASE WHEN cover_image_id = ? THEN ? ELSE cover_image_id END,
             updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(
          imageId,
          nullable(replacement?.id),
          now,
          albumId,
          projectId,
        ),
      this.db
        .prepare(
          `DELETE FROM site_gallery_images WHERE id = ? AND album_id = ?`,
        )
        .bind(imageId, albumId),
    ]);

    const deletedAsset = await this.deleteAssetIfUnreferenced(
      image.fileAssetId,
    );
    return { image, deleteObject: deletedAsset };
  }

  async recordAudit(data: SiteGalleryAuditData): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO audit_events
            (id, actor_type, actor_id, action, entity_type, entity_id,
             metadata, ip, user_agent, created_at)
           VALUES (?, 'admin', ?, ?, 'site_gallery_album', ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          data.actorId,
          data.action,
          data.albumId,
          JSON.stringify({
            projectId: data.projectId,
            ...(data.metadata ?? {}),
          }),
          nullable(data.ip),
          nullable(data.userAgent),
          nowIso(),
        )
        .run();
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'site_gallery.audit.failed',
          action: data.action,
          albumId: data.albumId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async listImages(albumId: string): Promise<SiteGalleryStoredImage[]> {
    const { results } = await this.db
      .prepare(
        `${IMAGE_SELECT}
         WHERE image.album_id = ?
         ORDER BY image.position ASC, image.created_at ASC`,
      )
      .bind(albumId)
      .all<StoredImageRow>();
    return results.map(mapStoredImage);
  }

  private async listPublishedImages(
    albumId: string,
  ): Promise<SiteGalleryStoredImage[]> {
    const { results } = await this.db
      .prepare(
        `${PUBLISHED_IMAGE_SELECT}
         WHERE image.album_id = ?
         ORDER BY image.position ASC, image.created_at ASC`,
      )
      .bind(albumId)
      .all<StoredImageRow>();
    return results.map(mapStoredImage);
  }

  private async deleteUnreferencedAssets(
    candidates: SiteGalleryStoredImage[],
  ): Promise<SiteGalleryStoredImage[]> {
    const removed: SiteGalleryStoredImage[] = [];
    for (const candidate of candidates) {
      if (await this.deleteAssetIfUnreferenced(candidate.fileAssetId)) {
        removed.push(candidate);
      }
    }
    return removed;
  }

  private async deleteAssetIfUnreferenced(fileAssetId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `DELETE FROM file_assets
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM site_gallery_images draft
             WHERE draft.file_asset_id = file_assets.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM site_gallery_publication_images publication
             WHERE publication.file_asset_id = file_assets.id
           )`,
      )
      .bind(fileAssetId)
      .run();
    return result.meta.changes > 0;
  }
}

const IMAGE_SELECT = `
  SELECT
    image.*,
    asset.key,
    asset.content_type,
    asset.size_bytes,
    asset.checksum
  FROM site_gallery_images image
  INNER JOIN site_gallery_albums album ON album.id = image.album_id
  INNER JOIN file_assets asset ON asset.id = image.file_asset_id`;

const PUBLISHED_IMAGE_SELECT = `
  SELECT
    image.image_id AS id,
    image.album_id,
    image.file_asset_id,
    image.alt,
    image.position,
    image.width,
    image.height,
    image.created_at,
    asset.key,
    asset.content_type,
    asset.size_bytes,
    asset.checksum
  FROM site_gallery_publication_images image
  INNER JOIN file_assets asset ON asset.id = image.file_asset_id`;

function mapAlbum(row: AlbumRow): SiteGalleryAlbumRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status as SiteGalleryStatus,
    coverImageId: row.cover_image_id,
    sortOrder: row.sort_order,
    publishedAt: row.published_at,
    publishedRevisionAt: row.published_revision_at,
    hasUnpublishedChanges:
      row.published_source_updated_at !== null &&
      row.updated_at !== row.published_source_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStoredImage(row: StoredImageRow): SiteGalleryStoredImage {
  return {
    id: row.id,
    albumId: row.album_id,
    fileAssetId: row.file_asset_id,
    alt: row.alt,
    position: row.position,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    key: row.key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
  };
}

function mapAlbumSummary(row: AlbumSummaryRow): SiteGalleryAlbumSummaryRecord {
  return {
    ...mapAlbum(row),
    imageCount: row.image_count,
    coverImage:
      row.cover_id &&
      row.cover_album_id &&
      row.cover_file_asset_id &&
      row.cover_position !== null &&
      row.cover_width !== null &&
      row.cover_height !== null &&
      row.cover_created_at &&
      row.cover_key &&
      row.cover_content_type &&
      row.cover_size_bytes !== null
        ? {
            id: row.cover_id,
            albumId: row.cover_album_id,
            fileAssetId: row.cover_file_asset_id,
            alt: row.cover_alt,
            position: row.cover_position,
            width: row.cover_width,
            height: row.cover_height,
            createdAt: row.cover_created_at,
            key: row.cover_key,
            contentType: row.cover_content_type,
            sizeBytes: row.cover_size_bytes,
            checksum: row.cover_checksum,
          }
        : null,
  };
}
