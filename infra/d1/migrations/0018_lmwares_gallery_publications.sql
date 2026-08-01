-- 0018_lmwares_gallery_publications.sql
-- Separa el borrador editable de la revisión pública de cada galería.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_gallery_publications (
  album_id      TEXT PRIMARY KEY
                  REFERENCES site_gallery_albums(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL
                  REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL,
  cover_image_id TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  revision_at   TEXT NOT NULL,
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_site_gallery_publications_public
  ON site_gallery_publications(project_id, sort_order, published_at DESC);

CREATE TABLE IF NOT EXISTS site_gallery_publication_images (
  album_id      TEXT NOT NULL
                  REFERENCES site_gallery_publications(album_id) ON DELETE CASCADE,
  image_id      TEXT NOT NULL,
  file_asset_id TEXT NOT NULL
                  REFERENCES file_assets(id) ON DELETE RESTRICT,
  alt           TEXT,
  position      INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  width         INTEGER NOT NULL CHECK (width > 0),
  height        INTEGER NOT NULL CHECK (height > 0),
  created_at    TEXT NOT NULL,
  PRIMARY KEY (album_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_site_gallery_publication_images_order
  ON site_gallery_publication_images(album_id, position, created_at);

-- Los álbumes publicados antes de esta migración se convierten en la primera
-- revisión inmutable, sin cambiar su URL ni su orden.
INSERT OR IGNORE INTO site_gallery_publications (
  album_id, project_id, slug, title, description, category, cover_image_id,
  sort_order, published_at, created_at, updated_at, revision_at
)
SELECT
  id, project_id, slug, title, description, category, cover_image_id,
  sort_order, COALESCE(published_at, updated_at), created_at, updated_at,
  updated_at
FROM site_gallery_albums
WHERE status = 'published';

INSERT OR IGNORE INTO site_gallery_publication_images (
  album_id, image_id, file_asset_id, alt, position, width, height, created_at
)
SELECT
  image.album_id, image.id, image.file_asset_id, image.alt, image.position,
  image.width, image.height, image.created_at
FROM site_gallery_images image
INNER JOIN site_gallery_publications publication
  ON publication.album_id = image.album_id;
