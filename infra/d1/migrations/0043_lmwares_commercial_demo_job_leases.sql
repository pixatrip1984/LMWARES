-- Fencing token and monotonic generation prevent a reclaimed runner from
-- completing an old attempt after its lease has expired.
ALTER TABLE lmw_commercial_agent_jobs ADD COLUMN lease_token TEXT;
ALTER TABLE lmw_commercial_agent_jobs ADD COLUMN execution_generation INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_agent_jobs_lease
  ON lmw_commercial_agent_jobs(id, status, claimed_by, lease_token, lease_until, execution_generation);
