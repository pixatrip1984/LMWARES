-- 0021_lmwares_event_publications.sql — Snapshot público inmutable de Eventos.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_event_publications (
  event_id                     TEXT PRIMARY KEY REFERENCES lmwares_events(id) ON DELETE CASCADE,
  project_id                   TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  slug                         TEXT NOT NULL,
  title                        TEXT NOT NULL,
  summary                      TEXT,
  description                  TEXT,
  venue_name                   TEXT,
  venue_address                TEXT,
  timezone                     TEXT NOT NULL,
  starts_at_utc                TEXT NOT NULL,
  ends_at_utc                  TEXT NOT NULL,
  registration_closes_at_utc   TEXT,
  capacity                     INTEGER,
  status                       TEXT NOT NULL CHECK (status IN ('published', 'cancelled', 'completed')),
  cover_asset_id               TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  event_created_at             TEXT NOT NULL,
  published_at                 TEXT NOT NULL,
  CHECK (capacity IS NULL OR capacity >= 1),
  CHECK (ends_at_utc > starts_at_utc),
  CHECK (registration_closes_at_utc IS NULL OR registration_closes_at_utc <= starts_at_utc),
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lmwares_event_publications_agenda
  ON lmwares_event_publications(project_id, status, starts_at_utc);

INSERT OR IGNORE INTO lmwares_event_publications (
  event_id, project_id, slug, title, summary, description, venue_name, venue_address,
  timezone, starts_at_utc, ends_at_utc, registration_closes_at_utc, capacity,
  status, cover_asset_id, event_created_at, published_at
)
SELECT
  id, project_id, slug, title, summary, description, venue_name, venue_address,
  timezone, starts_at_utc, ends_at_utc, registration_closes_at_utc, capacity,
  status, cover_asset_id, created_at, COALESCE(published_at, updated_at)
FROM lmwares_events
WHERE status IN ('published', 'cancelled', 'completed');
