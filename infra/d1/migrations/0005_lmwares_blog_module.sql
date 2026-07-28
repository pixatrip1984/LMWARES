-- 0005_lmwares_blog_module.sql — Vertical BLOG multi-tenant de LMWares.
-- El contenido pertenece a un lmwares_project; la portada reutiliza file_assets.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_site_blog_articles (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  summary        TEXT,
  cover_image_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  category       TEXT NOT NULL,
  body_format    TEXT NOT NULL DEFAULT 'blocks'
                 CHECK (body_format IN ('blocks', 'html')),
  body_json      TEXT NOT NULL DEFAULT '{"format":"blocks","blocks":[]}',
  body_html      TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'published', 'archived')),
  published_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_blog_project_status
  ON lmwares_site_blog_articles(project_id, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_blog_project_category
  ON lmwares_site_blog_articles(project_id, category, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_blog_project_updated
  ON lmwares_site_blog_articles(project_id, updated_at DESC);
