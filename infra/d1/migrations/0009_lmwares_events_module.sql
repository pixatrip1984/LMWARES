-- 0009_lmwares_events_module.sql — Vertical EVENTOS de sitios LMWARES.
-- Fechas de negocio en ISO-8601 UTC; timezone conserva la zona de presentación.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_events (
  id                         TEXT PRIMARY KEY,
  project_id                 TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  slug                       TEXT NOT NULL,
  title                      TEXT NOT NULL,
  summary                    TEXT,
  description                TEXT,
  venue_name                 TEXT,
  venue_address              TEXT,
  timezone                   TEXT NOT NULL DEFAULT 'America/Mexico_City',
  starts_at_utc              TEXT NOT NULL,
  ends_at_utc                TEXT NOT NULL,
  registration_closes_at_utc TEXT,
  capacity                   INTEGER,
  status                     TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  cover_asset_id             TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  published_at               TEXT,
  created_by                 TEXT NOT NULL,
  updated_by                 TEXT NOT NULL,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  CHECK (capacity IS NULL OR capacity >= 1),
  CHECK (ends_at_utc > starts_at_utc),
  CHECK (
    registration_closes_at_utc IS NULL
    OR registration_closes_at_utc <= starts_at_utc
  ),
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lmwares_events_project_agenda
  ON lmwares_events(project_id, status, starts_at_utc);

CREATE INDEX IF NOT EXISTS idx_lmwares_events_cover
  ON lmwares_events(cover_asset_id);

CREATE TABLE IF NOT EXISTS lmwares_event_registrations (
  id               TEXT PRIMARY KEY,
  event_id         TEXT NOT NULL REFERENCES lmwares_events(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone            TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('confirmed', 'cancelled')),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (event_id, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_lmwares_event_registrations_event
  ON lmwares_event_registrations(event_id, status, created_at);
