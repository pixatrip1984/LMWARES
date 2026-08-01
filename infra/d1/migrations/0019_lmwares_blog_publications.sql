-- 0019_lmwares_blog_publications.sql — Snapshot público inmutable del Blog.
-- La tabla editorial conserva el borrador; esta tabla es la única fuente pública.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_site_blog_publications (
  article_id      TEXT PRIMARY KEY
                  REFERENCES lmwares_site_blog_articles(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT,
  cover_image_id  TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  category        TEXT NOT NULL,
  body_format     TEXT NOT NULL CHECK (body_format IN ('blocks', 'html')),
  body_json       TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  article_created_at TEXT NOT NULL,
  published_at    TEXT NOT NULL,
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_blog_publications_project
  ON lmwares_site_blog_publications(project_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_blog_publications_category
  ON lmwares_site_blog_publications(project_id, category, published_at DESC);

INSERT OR IGNORE INTO lmwares_site_blog_publications (
  article_id, project_id, slug, title, summary, cover_image_id, category,
  body_format, body_json, body_html, article_created_at, published_at
)
SELECT
  id, project_id, slug, title, summary, cover_image_id, category,
  body_format, body_json, body_html, created_at, COALESCE(published_at, updated_at)
FROM lmwares_site_blog_articles
WHERE status = 'published';
