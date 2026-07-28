-- 0008_lmwares_forms_module.sql
-- Vertical aislada FORMULARIO/SOLICITUDES para proyectos LMWARES.
-- JSON se guarda como TEXT y las fechas como ISO-8601 UTC.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_site_forms (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL UNIQUE REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  draft_definition     TEXT NOT NULL CHECK (length(draft_definition) <= 100000),
  published_definition TEXT CHECK (
    published_definition IS NULL OR length(published_definition) <= 100000
  ),
  draft_revision       INTEGER NOT NULL DEFAULT 1 CHECK (draft_revision >= 1),
  published_revision   INTEGER CHECK (
    published_revision IS NULL OR published_revision >= 1
  ),
  published_at         TEXT,
  created_by           TEXT NOT NULL,
  updated_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_forms_published
  ON lmwares_site_forms(project_id, published_at);

CREATE TABLE IF NOT EXISTS lmwares_site_form_requests (
  id                  TEXT PRIMARY KEY,
  form_id             TEXT NOT NULL REFERENCES lmwares_site_forms(id) ON DELETE CASCADE,
  project_id          TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  form_revision       INTEGER NOT NULL CHECK (form_revision >= 1),
  status              TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'in-progress', 'responded', 'closed', 'spam')
  ),
  answers             TEXT NOT NULL CHECK (length(answers) <= 100000),
  definition_snapshot TEXT NOT NULL CHECK (length(definition_snapshot) <= 100000),
  internal_payload    TEXT NOT NULL DEFAULT '{}' CHECK (length(internal_payload) <= 100000),
  submitted_at        TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_form_requests_inbox
  ON lmwares_site_form_requests(project_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_form_requests_form
  ON lmwares_site_form_requests(form_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS lmwares_site_form_request_notes (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL REFERENCES lmwares_site_form_requests(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_form_request_notes_request
  ON lmwares_site_form_request_notes(request_id, created_at);

CREATE TABLE IF NOT EXISTS lmwares_site_form_status_history (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL REFERENCES lmwares_site_form_requests(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL CHECK (
    to_status IN ('new', 'in-progress', 'responded', 'closed', 'spam')
  ),
  changed_by   TEXT,
  reason       TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_form_status_history_request
  ON lmwares_site_form_status_history(request_id, created_at);

CREATE TABLE IF NOT EXISTS lmwares_site_form_audit_events (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  form_id     TEXT REFERENCES lmwares_site_forms(id) ON DELETE SET NULL,
  request_id  TEXT REFERENCES lmwares_site_form_requests(id) ON DELETE SET NULL,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('public', 'admin', 'system')),
  actor_id    TEXT,
  action      TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}' CHECK (length(metadata) <= 100000),
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_form_audit_project
  ON lmwares_site_form_audit_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmwares_site_form_audit_request
  ON lmwares_site_form_audit_events(request_id, created_at);
