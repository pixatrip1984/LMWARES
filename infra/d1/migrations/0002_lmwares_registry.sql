-- 0002_lmwares_registry.sql — Registro privado de proyectos y snapshots LMWARES.
-- El escáner local descubre; D1 conserva el estado canónico y la evidencia.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_projects (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  business          TEXT NOT NULL,
  category          TEXT NOT NULL,
  status_label      TEXT NOT NULL,
  phase             TEXT NOT NULL,
  progress          INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  priority          TEXT NOT NULL CHECK (priority IN ('Alta', 'Media', 'Normal')),
  health            TEXT NOT NULL CHECK (health IN ('on-track', 'needs-action', 'at-risk')),
  repo_path         TEXT NOT NULL UNIQUE,
  branch            TEXT NOT NULL,
  preview_url       TEXT NOT NULL DEFAULT '',
  last_refresh      TEXT NOT NULL,
  developer         TEXT NOT NULL,
  due               TEXT NOT NULL,
  day               INTEGER NOT NULL,
  days_left         INTEGER NOT NULL,
  next_action       TEXT NOT NULL,
  seed_prompt       TEXT NOT NULL,
  tags              TEXT NOT NULL DEFAULT '[]',
  preview           TEXT NOT NULL DEFAULT '{}',
  phases            TEXT NOT NULL DEFAULT '[]',
  registry_source   TEXT NOT NULL,
  manifest_path     TEXT,
  scan_metadata     TEXT NOT NULL DEFAULT '{}',
  first_seen_at     TEXT NOT NULL,
  last_scanned_at   TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lmwares_projects_priority
  ON lmwares_projects(priority, days_left, progress);
CREATE INDEX IF NOT EXISTS idx_lmwares_projects_health
  ON lmwares_projects(health, updated_at);
CREATE INDEX IF NOT EXISTS idx_lmwares_projects_scanned
  ON lmwares_projects(last_scanned_at);

CREATE TABLE IF NOT EXISTS lmwares_project_snapshots (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('scan', 'agent', 'preview', 'validation', 'manual')),
  label           TEXT NOT NULL,
  summary         TEXT,
  source_revision TEXT,
  preview_url     TEXT,
  artifact_path   TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lmwares_snapshots_project
  ON lmwares_project_snapshots(project_id, created_at DESC);

