import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { newId, nowIso, nullable, parseJson } from '../helpers';

type SiteBlogStatus = 'draft' | 'published' | 'archived';
type SiteBlogBodyFormat = 'blocks' | 'html';

export type SiteBlogStoredBody =
  | { format: 'blocks'; blocks: unknown[] }
  | { format: 'html'; html: string };

export interface SiteBlogArticleRecord {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  summary: string | null;
  coverImageId: string | null;
  coverImage: {
    id: string;
    key: string;
    contentType: string;
  } | null;
  category: string;
  body: SiteBlogStoredBody;
  bodyHtml: string;
  status: SiteBlogStatus;
  publishedAt: string | null;
  publishedRevisionAt: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteBlogArticlePageRecord {
  items: SiteBlogArticleRecord[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CreateSiteBlogArticleData {
  projectId: string;
  slug: string;
  title: string;
  summary: string | null;
  coverImageId: string | null;
  category: string;
  body: SiteBlogStoredBody;
  bodyHtml: string;
  status: SiteBlogStatus;
  changedBy: string;
}

export interface UpdateSiteBlogArticleData {
  slug?: string;
  title?: string;
  summary?: string | null;
  coverImageId?: string | null;
  category?: string;
  body?: SiteBlogStoredBody;
  bodyHtml?: string;
  status?: SiteBlogStatus;
  statusReason?: string | null;
  changedBy: string;
}

export interface SiteBlogCoverAssetData {
  key: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  originalName: string | null;
  createdBy: string;
}

export interface SiteBlogAuditData {
  actorId: string;
  action: string;
  articleId: string;
  projectId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

interface SiteBlogArticleRow {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_image_id: string | null;
  category: string;
  body_format: string;
  body_json: string;
  body_html: string;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  cover_key: string | null;
  cover_content_type: string | null;
  published_revision_at: string | null;
  has_unpublished_changes: number;
}

const ARTICLE_SELECT = `
  SELECT
    article.*,
    cover.key AS cover_key,
    cover.content_type AS cover_content_type,
    publication.published_at AS published_revision_at,
    CASE
      WHEN publication.article_id IS NULL THEN 0
      WHEN publication.slug <> article.slug
        OR publication.title <> article.title
        OR COALESCE(publication.summary, '') <> COALESCE(article.summary, '')
        OR COALESCE(publication.cover_image_id, '') <> COALESCE(article.cover_image_id, '')
        OR publication.category <> article.category
        OR publication.body_format <> article.body_format
        OR publication.body_json <> article.body_json
        OR publication.body_html <> article.body_html
      THEN 1 ELSE 0
    END AS has_unpublished_changes
  FROM lmwares_site_blog_articles article
  LEFT JOIN file_assets cover ON cover.id = article.cover_image_id
  LEFT JOIN lmwares_site_blog_publications publication ON publication.article_id = article.id
`;

const PUBLIC_ARTICLE_SELECT = `
  SELECT
    publication.article_id AS id,
    publication.project_id,
    publication.slug,
    publication.title,
    publication.summary,
    publication.cover_image_id,
    publication.category,
    publication.body_format,
    publication.body_json,
    publication.body_html,
    'published' AS status,
    publication.published_at,
    publication.article_created_at AS created_at,
    publication.published_at AS updated_at,
    cover.key AS cover_key,
    cover.content_type AS cover_content_type,
    publication.published_at AS published_revision_at,
    0 AS has_unpublished_changes
  FROM lmwares_site_blog_publications publication
  LEFT JOIN file_assets cover ON cover.id = publication.cover_image_id
`;

export class SiteBlogRepository {
  constructor(private readonly db: D1Database) {}

  async projectExists(projectId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM lmwares_projects WHERE id = ?`)
      .bind(projectId)
      .first<{ id: string }>();
    return Boolean(row);
  }

  async listAllForProject(projectId: string): Promise<SiteBlogArticleRecord[]> {
    const { results } = await this.db
      .prepare(
        `${ARTICLE_SELECT}
         WHERE article.project_id = ?
         ORDER BY article.updated_at DESC`,
      )
      .bind(projectId)
      .all<SiteBlogArticleRow>();
    return results.map(mapSiteBlogArticle);
  }

  async listPublishedForProject(
    projectId: string,
    query: {
      page: number;
      pageSize: number;
      q?: string;
      category?: string;
    },
  ): Promise<SiteBlogArticlePageRecord> {
    const clauses = [`publication.project_id = ?`];
    const params: unknown[] = [projectId];

    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      clauses.push(
        `(publication.title LIKE ? ESCAPE '\\' OR publication.summary LIKE ? ESCAPE '\\')`,
      );
      params.push(pattern, pattern);
    }
    if (query.category) {
      clauses.push(`publication.category = ?`);
      params.push(query.category);
    }

    const where = clauses.join(' AND ');
    const count = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM lmwares_site_blog_publications publication
         WHERE ${where}`,
      )
      .bind(...params)
      .first<{ count: number }>();
    const total = count?.count ?? 0;

    const { results } = await this.db
      .prepare(
        `${PUBLIC_ARTICLE_SELECT}
         WHERE ${where}
         ORDER BY publication.published_at DESC, publication.article_created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, query.pageSize, (query.page - 1) * query.pageSize)
      .all<SiteBlogArticleRow>();

    return {
      items: results.map(mapSiteBlogArticle),
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasMore: query.page * query.pageSize < total,
    };
  }

  async getBySlug(projectId: string, slug: string): Promise<SiteBlogArticleRecord | null> {
    const row = await this.db
      .prepare(
        `${ARTICLE_SELECT}
         WHERE article.project_id = ? AND article.slug = ?`,
      )
      .bind(projectId, slug)
      .first<SiteBlogArticleRow>();
    return row ? mapSiteBlogArticle(row) : null;
  }

  async getPublishedBySlug(projectId: string, slug: string): Promise<SiteBlogArticleRecord | null> {
    const row = await this.db
      .prepare(
        `${PUBLIC_ARTICLE_SELECT}
         WHERE publication.project_id = ? AND publication.slug = ?`,
      )
      .bind(projectId, slug)
      .first<SiteBlogArticleRow>();
    return row ? mapSiteBlogArticle(row) : null;
  }

  async create(data: CreateSiteBlogArticleData): Promise<SiteBlogArticleRecord> {
    const id = newId();
    const now = nowIso();
    const publishedAt = data.status === 'published' ? now : null;

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO lmwares_site_blog_articles (
            id, project_id, slug, title, summary, cover_image_id, category,
            body_format, body_json, body_html, status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          data.projectId,
          data.slug,
          data.title,
          nullable(data.summary),
          nullable(data.coverImageId),
          data.category,
          data.body.format,
          JSON.stringify(data.body),
          data.bodyHtml,
          data.status,
          publishedAt,
          now,
          now,
        ),
      statusHistoryStatement(this.db, {
        articleId: id,
        fromStatus: null,
        toStatus: data.status,
        changedBy: data.changedBy,
        reason: 'Creación del artículo.',
        createdAt: now,
      }),
    ];
    if (data.status === 'published') {
      statements.push(
        publicationUpsertStatement(this.db, {
          articleId: id,
          projectId: data.projectId,
          slug: data.slug,
          title: data.title,
          summary: data.summary,
          coverImageId: data.coverImageId,
          category: data.category,
          body: data.body,
          bodyHtml: data.bodyHtml,
          articleCreatedAt: now,
          publishedAt: now,
        }),
      );
    }
    await this.db.batch(statements);

    const created = await this.getBySlug(data.projectId, data.slug);
    if (!created) throw new Error('No se pudo leer el artículo recién creado.');
    return created;
  }

  async update(
    projectId: string,
    currentSlug: string,
    patch: UpdateSiteBlogArticleData,
  ): Promise<SiteBlogArticleRecord | null> {
    const existing = await this.getBySlug(projectId, currentSlug);
    if (!existing) return null;

    const next = {
      slug: patch.slug ?? existing.slug,
      title: patch.title ?? existing.title,
      summary: patch.summary !== undefined ? patch.summary : existing.summary,
      coverImageId: patch.coverImageId !== undefined ? patch.coverImageId : existing.coverImageId,
      category: patch.category ?? existing.category,
      body: patch.body ?? existing.body,
      bodyHtml: patch.bodyHtml ?? existing.bodyHtml,
      status: patch.status ?? existing.status,
    };
    const now = nowIso();
    const publishedAt =
      next.status === 'published' ? (existing.publishedAt ?? now) : existing.publishedAt;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE lmwares_site_blog_articles SET
            slug = ?, title = ?, summary = ?, cover_image_id = ?, category = ?,
            body_format = ?, body_json = ?, body_html = ?, status = ?,
            published_at = ?, updated_at = ?
           WHERE project_id = ? AND slug = ?`,
        )
        .bind(
          next.slug,
          next.title,
          nullable(next.summary),
          nullable(next.coverImageId),
          next.category,
          next.body.format,
          JSON.stringify(next.body),
          next.bodyHtml,
          next.status,
          publishedAt,
          now,
          projectId,
          currentSlug,
        ),
    ];

    if (next.status !== existing.status) {
      statements.push(
        statusHistoryStatement(this.db, {
          articleId: existing.id,
          fromStatus: existing.status,
          toStatus: next.status,
          changedBy: patch.changedBy,
          reason: patch.statusReason ?? null,
          createdAt: now,
        }),
      );
    }

    if (next.status === 'published') {
      statements.push(
        publicationUpsertStatement(this.db, {
          articleId: existing.id,
          projectId,
          slug: next.slug,
          title: next.title,
          summary: next.summary,
          coverImageId: next.coverImageId,
          category: next.category,
          body: next.body,
          bodyHtml: next.bodyHtml,
          articleCreatedAt: existing.createdAt,
          publishedAt: now,
        }),
      );
    } else if (next.status === 'archived') {
      statements.push(
        this.db
          .prepare(`DELETE FROM lmwares_site_blog_publications WHERE article_id = ?`)
          .bind(existing.id),
      );
    }

    await this.db.batch(statements);
    return this.getBySlug(projectId, next.slug);
  }

  /**
   * Registra el FileAsset y lo enlaza como portada en el mismo batch D1.
   * La ruta se encarga de compensar el objeto R2 si este batch falla.
   */
  async createAndAttachCover(
    projectId: string,
    slug: string,
    asset: SiteBlogCoverAssetData,
  ): Promise<SiteBlogArticleRecord | null> {
    const existing = await this.getBySlug(projectId, slug);
    if (!existing) return null;

    const assetId = newId();
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO file_assets (
            id, key, bucket, content_type, size_bytes, original_name,
            checksum, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          assetId,
          asset.key,
          asset.bucket,
          asset.contentType,
          asset.sizeBytes,
          nullable(asset.originalName),
          asset.createdBy,
          now,
        ),
      this.db
        .prepare(
          `UPDATE lmwares_site_blog_articles
           SET cover_image_id = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(assetId, now, existing.id, projectId),
    ]);

    return this.getBySlug(projectId, slug);
  }

  /**
   * Auditoría best-effort, consistente con AuditRepository: un fallo del
   * registro append-only no revierte la escritura editorial ya confirmada.
   */
  async recordAudit(data: SiteBlogAuditData): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor_type, actor_id, action, entity_type, entity_id,
            metadata, ip, user_agent, created_at
          ) VALUES (?, 'admin', ?, ?, 'site_blog_article', ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          data.actorId,
          data.action,
          data.articleId,
          JSON.stringify({ projectId: data.projectId, ...(data.metadata ?? {}) }),
          nullable(data.ip),
          nullable(data.userAgent),
          nowIso(),
        )
        .run();
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'site_blog.audit.record_failed',
          articleId: data.articleId,
          projectId: data.projectId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

function publicationUpsertStatement(
  db: D1Database,
  data: {
    articleId: string;
    projectId: string;
    slug: string;
    title: string;
    summary: string | null;
    coverImageId: string | null;
    category: string;
    body: SiteBlogStoredBody;
    bodyHtml: string;
    articleCreatedAt: string;
    publishedAt: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO lmwares_site_blog_publications (
         article_id, project_id, slug, title, summary, cover_image_id, category,
         body_format, body_json, body_html, article_created_at, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(article_id) DO UPDATE SET
         project_id = excluded.project_id,
         slug = excluded.slug,
         title = excluded.title,
         summary = excluded.summary,
         cover_image_id = excluded.cover_image_id,
         category = excluded.category,
         body_format = excluded.body_format,
         body_json = excluded.body_json,
         body_html = excluded.body_html,
         article_created_at = excluded.article_created_at,
         published_at = excluded.published_at`,
    )
    .bind(
      data.articleId,
      data.projectId,
      data.slug,
      data.title,
      nullable(data.summary),
      nullable(data.coverImageId),
      data.category,
      data.body.format,
      JSON.stringify(data.body),
      data.bodyHtml,
      data.articleCreatedAt,
      data.publishedAt,
    );
}

function statusHistoryStatement(
  db: D1Database,
  data: {
    articleId: string;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string;
    reason: string | null;
    createdAt: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO status_history (
        id, entity_type, entity_id, from_status, to_status,
        changed_by, reason, created_at
      ) VALUES (?, 'site_blog_article', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      data.articleId,
      nullable(data.fromStatus),
      data.toStatus,
      data.changedBy,
      nullable(data.reason),
      data.createdAt,
    );
}

function mapSiteBlogArticle(row: SiteBlogArticleRow): SiteBlogArticleRecord {
  const fallbackBody: SiteBlogStoredBody =
    row.body_format === 'html'
      ? { format: 'html', html: row.body_html }
      : { format: 'blocks', blocks: [] };
  const body = parseJson<SiteBlogStoredBody>(row.body_json, fallbackBody);

  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverImageId: row.cover_image_id,
    coverImage:
      row.cover_image_id && row.cover_key && row.cover_content_type
        ? {
            id: row.cover_image_id,
            key: row.cover_key,
            contentType: row.cover_content_type,
          }
        : null,
    category: row.category,
    body,
    bodyHtml: row.body_html,
    status: row.status as SiteBlogStatus,
    publishedAt: row.published_at,
    publishedRevisionAt: row.published_revision_at,
    hasUnpublishedChanges: row.has_unpublished_changes === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
