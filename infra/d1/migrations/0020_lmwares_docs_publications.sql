-- 0020_lmwares_docs_publications.sql — Snapshot público inmutable de Docs.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_doc_publications (
  document_id          TEXT PRIMARY KEY REFERENCES lmwares_docs(id) ON DELETE CASCADE,
  project_id           TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  category_id          TEXT,
  category_name        TEXT,
  category_slug        TEXT,
  category_description TEXT,
  category_sort_order  INTEGER,
  title                TEXT NOT NULL,
  description          TEXT,
  access_level         TEXT NOT NULL CHECK (access_level IN ('public', 'private')),
  download_enabled     INTEGER NOT NULL CHECK (download_enabled IN (0, 1)),
  metadata             TEXT NOT NULL,
  sort_order           INTEGER NOT NULL,
  document_created_at  TEXT NOT NULL,
  version_id           TEXT NOT NULL REFERENCES lmwares_doc_versions(id) ON DELETE CASCADE,
  version_number       INTEGER NOT NULL,
  file_asset_id        TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  original_name        TEXT NOT NULL,
  extension            TEXT NOT NULL,
  declared_mime        TEXT,
  detected_mime        TEXT NOT NULL,
  size_bytes           INTEGER NOT NULL,
  published_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmwares_doc_publications_project
  ON lmwares_doc_publications(project_id, category_sort_order, sort_order, title);

INSERT OR IGNORE INTO lmwares_doc_publications (
  document_id, project_id,
  category_id, category_name, category_slug, category_description, category_sort_order,
  title, description, access_level, download_enabled, metadata, sort_order,
  document_created_at, version_id, version_number, file_asset_id, original_name,
  extension, declared_mime, detected_mime, size_bytes, published_at
)
SELECT
  d.id, d.project_id,
  c.id, c.name, c.slug, c.description, c.sort_order,
  d.title, d.description, d.access_level, d.download_enabled, d.metadata, d.sort_order,
  d.created_at, v.id, v.version, v.file_asset_id, v.original_name,
  v.extension, v.declared_mime, v.detected_mime, v.size_bytes,
  COALESCE(d.published_at, v.published_at, d.updated_at)
FROM lmwares_docs d
INNER JOIN lmwares_doc_versions v ON v.id = d.current_version_id
LEFT JOIN lmwares_doc_categories c ON c.id = d.category_id
WHERE d.status = 'published'
  AND v.status = 'published'
  AND v.file_asset_id IS NOT NULL
  AND v.extension IS NOT NULL
  AND v.detected_mime IS NOT NULL;
