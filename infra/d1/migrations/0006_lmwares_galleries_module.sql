-- 0006_lmwares_galleries_module.sql — Vertical aislada de galerías LMWARES.
-- Cada álbum pertenece al registro canónico lmwares_projects. Los binarios
-- viven en R2; site_gallery_images sólo enlaza metadatos de file_assets.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_gallery_albums (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'published')),
  cover_image_id TEXT REFERENCES site_gallery_images(id) ON DELETE SET NULL
                   DEFERRABLE INITIALLY DEFERRED,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_site_gallery_albums_admin
  ON site_gallery_albums(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_gallery_albums_public
  ON site_gallery_albums(project_id, status, sort_order, published_at DESC);

CREATE TABLE IF NOT EXISTS site_gallery_images (
  id            TEXT PRIMARY KEY,
  album_id      TEXT NOT NULL REFERENCES site_gallery_albums(id) ON DELETE CASCADE,
  file_asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  alt           TEXT,
  position      INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  width         INTEGER NOT NULL CHECK (width > 0),
  height        INTEGER NOT NULL CHECK (height > 0),
  created_at    TEXT NOT NULL,
  UNIQUE (album_id, file_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_site_gallery_images_order
  ON site_gallery_images(album_id, position, created_at);
