-- Immutable, server-authored input for a Phase 0 frontend demo. A source build
-- can be retried, but its accepted offer and spec snapshot may never be edited.
CREATE TABLE IF NOT EXISTS lmw_commercial_demo_build_specs (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL REFERENCES lmw_commercial_demo_lifecycles(id) ON DELETE CASCADE,
  intake_id TEXT NOT NULL REFERENCES lmw_package_intakes(id) ON DELETE CASCADE,
  accepted_offer_id TEXT NOT NULL REFERENCES lmw_commercial_offers(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  spec_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lifecycle_id, revision),
  UNIQUE(lifecycle_id, spec_digest)
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_demo_build_specs_lifecycle
  ON lmw_commercial_demo_build_specs(lifecycle_id, revision DESC);
