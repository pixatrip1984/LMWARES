-- A Phase 0 release is a routed static site, not a single HTML object.
ALTER TABLE lmw_commercial_demo_releases ADD COLUMN route_manifest_json TEXT NOT NULL DEFAULT '{"schemaVersion":"lmwares.site-route-manifest.v1","routes":[]}';
ALTER TABLE lmw_commercial_demo_releases ADD COLUMN route_manifest_digest TEXT NOT NULL DEFAULT '';
ALTER TABLE lmw_commercial_demo_lifecycles ADD COLUMN demo_release_id TEXT;
CREATE INDEX IF NOT EXISTS idx_lmw_demo_lifecycle_release
  ON lmw_commercial_demo_lifecycles(demo_release_id);
