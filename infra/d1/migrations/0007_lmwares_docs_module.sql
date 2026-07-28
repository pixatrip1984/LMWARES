-- 0007_lmwares_docs_module.sql — Vertical DOCS de LMWARES.
-- D1 conserva catálogo, permisos, versiones y estado; R2 conserva los bytes.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_doc_categories (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_lmwares_doc_categories_project
  ON lmwares_doc_categories(project_id, sort_order, name);

CREATE TABLE IF NOT EXISTS lmwares_docs (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  category_id        TEXT REFERENCES lmwares_doc_categories(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN (
                       'uploading', 'quarantine', 'scanning', 'clean', 'rejected', 'published'
                     )),
  access_level       TEXT NOT NULL DEFAULT 'private' CHECK (access_level IN ('public', 'private')),
  download_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (download_enabled IN (0, 1)),
  current_version_id TEXT,
  metadata           TEXT NOT NULL DEFAULT '{}',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_by         TEXT NOT NULL,
  published_at       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lmwares_docs_admin
  ON lmwares_docs(project_id, category_id, sort_order, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmwares_docs_public
  ON lmwares_docs(project_id, status, access_level, download_enabled, sort_order);

CREATE TABLE IF NOT EXISTS lmwares_doc_versions (
  id                TEXT PRIMARY KEY,
  document_id       TEXT NOT NULL REFERENCES lmwares_docs(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL CHECK (version >= 1),
  file_asset_id     TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  original_name     TEXT NOT NULL,
  extension         TEXT,
  declared_mime     TEXT,
  detected_mime     TEXT,
  size_bytes        INTEGER NOT NULL CHECK (size_bytes >= 0),
  status            TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN (
                      'uploading', 'quarantine', 'scanning', 'clean', 'rejected', 'published'
                    )),
  validation        TEXT NOT NULL DEFAULT '{}',
  rejection_code    TEXT,
  rejection_reason  TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  scanned_at        TEXT,
  published_at      TEXT,
  UNIQUE (document_id, version)
);
CREATE INDEX IF NOT EXISTS idx_lmwares_doc_versions_document
  ON lmwares_doc_versions(document_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_lmwares_doc_versions_status
  ON lmwares_doc_versions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmwares_doc_versions_asset
  ON lmwares_doc_versions(file_asset_id);

-- Los triggers impiden apuntar current_version_id a una versión de otro documento.
CREATE TRIGGER IF NOT EXISTS trg_lmwares_docs_current_version_insert
BEFORE INSERT ON lmwares_docs
WHEN NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lmwares_doc_versions
    WHERE id = NEW.current_version_id AND document_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'current_version_id must belong to document');
END;

CREATE TRIGGER IF NOT EXISTS trg_lmwares_docs_current_version_update
BEFORE UPDATE OF current_version_id ON lmwares_docs
WHEN NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lmwares_doc_versions
    WHERE id = NEW.current_version_id AND document_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'current_version_id must belong to document');
END;
