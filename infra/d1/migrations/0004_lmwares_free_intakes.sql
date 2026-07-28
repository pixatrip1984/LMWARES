-- Flujo Free LMWares: intake público, assets, cola lógica y publicación estática.

CREATE TABLE IF NOT EXISTS lmw_free_intakes (
  id                   TEXT PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  site_name            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft',
  contact_name         TEXT NOT NULL,
  contact_email        TEXT NOT NULL,
  business_description TEXT NOT NULL,
  audience             TEXT NOT NULL,
  sector               TEXT,
  style                TEXT NOT NULL,
  primary_action       TEXT NOT NULL DEFAULT 'contactar',
  request_id           TEXT REFERENCES requests(id) ON DELETE SET NULL,
  terms_accepted_at    TEXT,
  published_url        TEXT,
  qr_asset_id          TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  generation_job_id    TEXT,
  error_code           TEXT,
  error_message        TEXT,
  metadata             TEXT NOT NULL DEFAULT '{}',
  submitted_at         TEXT,
  published_at         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_free_intakes_status
  ON lmw_free_intakes(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_free_intakes_email
  ON lmw_free_intakes(contact_email, created_at DESC);

CREATE TABLE IF NOT EXISTS lmw_contact_methods (
  id             TEXT PRIMARY KEY,
  intake_id      TEXT NOT NULL REFERENCES lmw_free_intakes(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL,
  value          TEXT NOT NULL,
  label          TEXT,
  public_visible INTEGER NOT NULL DEFAULT 1,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_contact_methods_intake
  ON lmw_contact_methods(intake_id, position);

CREATE TABLE IF NOT EXISTS lmw_free_assets (
  id            TEXT PRIMARY KEY,
  intake_id     TEXT NOT NULL REFERENCES lmw_free_intakes(id) ON DELETE CASCADE,
  file_asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'source',
  position      INTEGER NOT NULL DEFAULT 0,
  safety_status TEXT NOT NULL DEFAULT 'quarantined',
  checksum      TEXT,
  width         INTEGER,
  height        INTEGER,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_free_assets_intake
  ON lmw_free_assets(intake_id, position);

CREATE TABLE IF NOT EXISTS lmw_slug_reservations (
  slug       TEXT PRIMARY KEY,
  intake_id  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'reserved',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_slug_reservations_intake
  ON lmw_slug_reservations(intake_id);

CREATE TABLE IF NOT EXISTS lmw_generation_jobs (
  id            TEXT PRIMARY KEY,
  intake_id     TEXT NOT NULL REFERENCES lmw_free_intakes(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  attempt       INTEGER NOT NULL DEFAULT 0,
  lease_until   TEXT,
  claimed_by    TEXT,
  error_code    TEXT,
  error_message TEXT,
  metadata      TEXT NOT NULL DEFAULT '{}',
  queued_at     TEXT,
  started_at    TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_generation_jobs_status
  ON lmw_generation_jobs(status, queued_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_generation_jobs_intake_type
  ON lmw_generation_jobs(intake_id, type);

CREATE TABLE IF NOT EXISTS lmw_published_sites (
  slug         TEXT PRIMARY KEY,
  intake_id    TEXT NOT NULL REFERENCES lmw_free_intakes(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL DEFAULT 1,
  manifest_key TEXT NOT NULL,
  index_key    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_published_sites_intake
  ON lmw_published_sites(intake_id);
