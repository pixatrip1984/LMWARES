-- 0003_lmwares_gates.sql — Evidencia técnica y decisiones humanas append-only.
-- Registrar una aprobación nunca ejecuta un despliegue.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lmwares_validation_results (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  snapshot_id     TEXT REFERENCES lmwares_project_snapshots(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN (
                    'typecheck', 'build', 'tests', 'workers-dry-run',
                    'd1-migrations', 'visual-qa', 'security', 'custom'
                  )),
  status          TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'blocked', 'skipped')),
  label           TEXT NOT NULL,
  summary         TEXT,
  source_revision TEXT,
  artifact_path   TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lmwares_validations_project
  ON lmwares_validation_results(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmwares_validations_snapshot
  ON lmwares_validation_results(snapshot_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lmwares_approvals (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES lmwares_projects(id) ON DELETE CASCADE,
  snapshot_id TEXT REFERENCES lmwares_project_snapshots(id) ON DELETE SET NULL,
  gate        TEXT NOT NULL CHECK (gate IN (
                'contract', 'visual', 'local-operation', 'validation', 'staging', 'production'
              )),
  decision    TEXT NOT NULL CHECK (decision IN ('approved', 'changes-requested', 'rejected')),
  comment     TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  decided_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lmwares_approvals_project
  ON lmwares_approvals(project_id, gate, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmwares_approvals_snapshot
  ON lmwares_approvals(snapshot_id, created_at DESC);
