-- Entregas firmadas de Mercado Pago. Conserva evidencia e impide procesar dos
-- veces la misma notificación antes de consultar el recurso al proveedor.

CREATE TABLE IF NOT EXISTS lmw_payment_webhook_events (
  id                  TEXT PRIMARY KEY,
  provider            TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_request_id TEXT NOT NULL UNIQUE,
  topic               TEXT NOT NULL,
  resource_id         TEXT NOT NULL,
  proposal_id         TEXT REFERENCES lmw_package_proposals(id) ON DELETE SET NULL,
  status              TEXT NOT NULL CHECK (
    status IN ('processing', 'processed', 'ignored', 'failed')
  ),
  attempts            INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  error_code          TEXT,
  received_at         TEXT NOT NULL,
  processed_at        TEXT,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_payment_webhook_events_resource
  ON lmw_payment_webhook_events(provider, topic, resource_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_payment_webhook_events_status
  ON lmw_payment_webhook_events(status, updated_at DESC);
