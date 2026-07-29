-- Separa los originales privados de los derivados saneados que sí puede publicar Free.

ALTER TABLE lmw_free_assets
  ADD COLUMN sanitized_file_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lmw_free_assets_sanitized_file
  ON lmw_free_assets(sanitized_file_asset_id);
