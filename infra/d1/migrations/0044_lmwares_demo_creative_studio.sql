-- Immutable private-creative-studio contracts. A release is never served just
-- because it exists; review/publication are separate server-owned states.
CREATE TABLE IF NOT EXISTS lmw_commercial_demo_generation_manifests (
  id TEXT PRIMARY KEY,
  build_spec_id TEXT NOT NULL,
  lifecycle_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lifecycle_id, revision),
  UNIQUE(lifecycle_id, manifest_digest)
);
CREATE INDEX IF NOT EXISTS idx_lmw_demo_generation_manifest_lifecycle
  ON lmw_commercial_demo_generation_manifests(lifecycle_id, revision DESC);

CREATE TABLE IF NOT EXISTS lmw_commercial_demo_creative_runs (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  generation_manifest_id TEXT NOT NULL,
  execution_generation INTEGER NOT NULL,
  candidate_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  project_path TEXT,
  error_code TEXT,
  error_message TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, execution_generation),
  UNIQUE(lifecycle_id, candidate_number)
);
CREATE INDEX IF NOT EXISTS idx_lmw_demo_creative_runs_lifecycle
  ON lmw_commercial_demo_creative_runs(lifecycle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lmw_commercial_demo_releases (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL,
  creative_run_id TEXT NOT NULL,
  build_spec_digest TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  artifact_prefix TEXT NOT NULL,
  build_digest TEXT NOT NULL,
  asset_manifest_digest TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  publication_status TEXT NOT NULL DEFAULT 'unpublished',
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(creative_run_id),
  UNIQUE(lifecycle_id, artifact_prefix)
);
CREATE INDEX IF NOT EXISTS idx_lmw_demo_releases_lifecycle
  ON lmw_commercial_demo_releases(lifecycle_id, review_status, publication_status, created_at DESC);
