import type {
  D1Database,
} from '@cloudflare/workers-types';
import type {
  Paginated,
  PaginationParams,
  Publication,
  PublicationImage,
  PublicationStatus,
} from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';
import {
  mapPublication,
  mapPublicationImage,
  mapPublicationImageJoin,
} from '../mappers';
import type {
  PublicationImageJoinRow,
  PublicationImageRow,
  PublicationRow,
} from '../rows';

export interface CreatePublicationData {
  slug: string;
  title: string;
  summary?: string | null;
  body?: string | null;
  status: PublicationStatus;
  coverImageId?: string | null;
  metadata: Record<string, unknown>;
  sortOrder: number;
}

export type UpdatePublicationData = Partial<Omit<CreatePublicationData, 'status'>>;

export class PublicationsRepository {
  constructor(private readonly db: D1Database) {}

  /** Listado público: solo publicaciones publicadas. */
  async listPublished(
    { page, pageSize }: PaginationParams,
    q?: string,
  ): Promise<Paginated<Publication>> {
    const where = q ? `status = ? AND (title LIKE ? OR summary LIKE ?)` : `status = ?`;
    const params: unknown[] = q ? ['published', `%${q}%`, `%${q}%`] : ['published'];

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) AS c FROM publications WHERE ${where}`)
      .bind(...params)
      .first<{ c: number }>();
    const total = countRow?.c ?? 0;

    const { results } = await this.db
      .prepare(
        `SELECT * FROM publications WHERE ${where}
         ORDER BY sort_order ASC, published_at DESC, created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, (page - 1) * pageSize)
      .all<PublicationRow>();

    return paginate(results.map(mapPublication), page, pageSize, total);
  }

  /** Detalle público por slug (solo si está publicada). */
  async getPublishedBySlug(slug: string): Promise<Publication | null> {
    const row = await this.db
      .prepare(`SELECT * FROM publications WHERE slug = ? AND status = 'published'`)
      .bind(slug)
      .first<PublicationRow>();
    return row ? mapPublication(row) : null;
  }

  /** Listado admin: todos los estados. */
  async listAll({ page, pageSize }: PaginationParams): Promise<Paginated<Publication>> {
    const countRow = await this.db
      .prepare(`SELECT COUNT(*) AS c FROM publications`)
      .first<{ c: number }>();
    const total = countRow?.c ?? 0;

    const { results } = await this.db
      .prepare(
        `SELECT * FROM publications
         ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(pageSize, (page - 1) * pageSize)
      .all<PublicationRow>();

    return paginate(results.map(mapPublication), page, pageSize, total);
  }

  async getById(id: string): Promise<Publication | null> {
    const row = await this.db
      .prepare(`SELECT * FROM publications WHERE id = ?`)
      .bind(id)
      .first<PublicationRow>();
    return row ? mapPublication(row) : null;
  }

  async getBySlug(slug: string): Promise<Publication | null> {
    const row = await this.db
      .prepare(`SELECT * FROM publications WHERE slug = ?`)
      .bind(slug)
      .first<PublicationRow>();
    return row ? mapPublication(row) : null;
  }

  async create(data: CreatePublicationData): Promise<Publication> {
    const id = newId();
    const now = nowIso();
    const publishedAt = data.status === 'published' ? now : null;
    await this.db
      .prepare(
        `INSERT INTO publications
          (id, slug, title, summary, body, status, cover_image_id, metadata, sort_order, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.slug,
        data.title,
        nullable(data.summary),
        nullable(data.body),
        data.status,
        nullable(data.coverImageId),
        JSON.stringify(data.metadata ?? {}),
        data.sortOrder,
        publishedAt,
        now,
        now,
      )
      .run();
    return (await this.getById(id))!;
  }

  async update(id: string, patch: UpdatePublicationData): Promise<Publication | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const next = { ...existing, ...patch };
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE publications SET
          slug = ?, title = ?, summary = ?, body = ?,
          cover_image_id = ?, metadata = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        next.slug,
        next.title,
        nullable(next.summary),
        nullable(next.body),
        nullable(next.coverImageId),
        JSON.stringify(next.metadata ?? {}),
        next.sortOrder,
        now,
        id,
      )
      .run();
    return this.getById(id);
  }

  /** Cambia el estado y ajusta published_at si corresponde. */
  async setStatus(id: string, status: PublicationStatus): Promise<Publication | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const now = nowIso();
    const publishedAt =
      status === 'published' ? (existing.publishedAt ?? now) : existing.publishedAt;
    await this.db
      .prepare(
        `UPDATE publications SET status = ?, published_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(status, publishedAt, now, id)
      .run();
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.prepare(`DELETE FROM publications WHERE id = ?`).bind(id).run();
    return (res.meta.changes ?? 0) > 0;
  }

  // ── Imágenes ───────────────────────────────────────────────
  async listImages(publicationId: string) {
    const { results } = await this.db
      .prepare(
        `SELECT pi.*, fa.key AS key, fa.content_type AS content_type
         FROM publication_images pi
         JOIN file_assets fa ON fa.id = pi.file_asset_id
         WHERE pi.publication_id = ?
         ORDER BY pi.position ASC, pi.created_at ASC`,
      )
      .bind(publicationId)
      .all<PublicationImageJoinRow>();
    return results.map(mapPublicationImageJoin);
  }

  async addImage(data: {
    publicationId: string;
    fileAssetId: string;
    alt?: string | null;
    position: number;
  }): Promise<PublicationImage> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO publication_images (id, publication_id, file_asset_id, alt, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, data.publicationId, data.fileAssetId, nullable(data.alt), data.position, now)
      .run();
    const row = await this.db
      .prepare(`SELECT * FROM publication_images WHERE id = ?`)
      .bind(id)
      .first<PublicationImageRow>();
    return mapPublicationImage(row!);
  }

  /** Devuelve la fila de imagen (incluye file_asset_id) o null. */
  async getImage(publicationId: string, imageId: string): Promise<PublicationImage | null> {
    const row = await this.db
      .prepare(`SELECT * FROM publication_images WHERE id = ? AND publication_id = ?`)
      .bind(imageId, publicationId)
      .first<PublicationImageRow>();
    return row ? mapPublicationImage(row) : null;
  }

  async removeImage(publicationId: string, imageId: string): Promise<boolean> {
    const res = await this.db
      .prepare(`DELETE FROM publication_images WHERE id = ? AND publication_id = ?`)
      .bind(imageId, publicationId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }
}

function paginate<T>(items: T[], page: number, pageSize: number, total: number): Paginated<T> {
  return { items, page, pageSize, total, hasMore: page * pageSize < total };
}
