-- 0001_init.sql — Esquema base de la plantilla madre (D1 / SQLite).
-- Mantener en sync con packages/db/src/rows.ts
-- Las fechas se guardan como TEXT ISO-8601 UTC. JSON como TEXT. Bool como 0/1.

PRAGMA foreign_keys = ON;

-- Archivos en R2 (el binario vive en R2; aquí solo metadatos).
CREATE TABLE IF NOT EXISTS file_assets (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  bucket        TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  original_name TEXT,
  checksum      TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL
);

-- Contenido publicable genérico (catálogo / portfolio / galería / blog).
CREATE TABLE IF NOT EXISTS publications (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  summary        TEXT,
  body           TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  cover_image_id TEXT,
  metadata       TEXT NOT NULL DEFAULT '{}',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status);
CREATE INDEX IF NOT EXISTS idx_publications_published_at ON publications(published_at);
CREATE INDEX IF NOT EXISTS idx_publications_sort ON publications(sort_order);

-- Galería ordenada de imágenes por publicación.
CREATE TABLE IF NOT EXISTS publication_images (
  id             TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  file_asset_id  TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  alt            TEXT,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pub_images_pub ON publication_images(publication_id);

-- Solicitudes entrantes desde el frontend público.
CREATE TABLE IF NOT EXISTS requests (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL DEFAULT 'contact',
  status         TEXT NOT NULL DEFAULT 'new',
  publication_id TEXT REFERENCES publications(id) ON DELETE SET NULL,
  contact_name   TEXT NOT NULL,
  contact_email  TEXT NOT NULL,
  contact_phone  TEXT,
  message        TEXT,
  payload        TEXT NOT NULL DEFAULT '{}',
  source         TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_type ON requests(type);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);

-- Notas internas de admins sobre solicitudes.
CREATE TABLE IF NOT EXISTS request_notes (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_notes_req ON request_notes(request_id);

-- Historial inmutable de cambios de estado (publicaciones y solicitudes).
CREATE TABLE IF NOT EXISTS status_history (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT,
  reason      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_history_entity ON status_history(entity_type, entity_id);

-- Auditoría append-only.
CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  actor_type  TEXT NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);

-- Espejo local de usuarios admin (identidad real la provee Cloudflare Access).
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'viewer',
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL
);
