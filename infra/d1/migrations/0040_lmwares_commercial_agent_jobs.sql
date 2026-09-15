-- Trabajo auditable para la propuesta automática y el constructor local de demos.
CREATE TABLE IF NOT EXISTS lmw_commercial_agent_jobs (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES lmw_package_intakes(id) ON DELETE CASCADE,
  lifecycle_id TEXT REFERENCES lmw_commercial_demo_lifecycles(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('scope', 'demo')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'claimed', 'completed', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  claimed_by TEXT,
  lease_until TEXT,
  project_path TEXT,
  result_json TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_commercial_agent_jobs_open
  ON lmw_commercial_agent_jobs(intake_id, job_type);
CREATE INDEX IF NOT EXISTS idx_lmw_commercial_agent_jobs_claim
  ON lmw_commercial_agent_jobs(job_type, status, lease_until, created_at);
