-- Historial separado por pago de Mercado Pago. Una propuesta conserva como
-- canónico el primer pago aprobado; cualquier aprobado adicional exige revisión.

ALTER TABLE lmw_package_proposals
  ADD COLUMN payment_review_required INTEGER NOT NULL DEFAULT 0
  CHECK (payment_review_required IN (0, 1));

ALTER TABLE lmw_package_proposals
  ADD COLUMN checkout_expires_at TEXT;

CREATE TABLE IF NOT EXISTS lmw_payment_attempts (
  id                       TEXT PRIMARY KEY,
  proposal_id              TEXT NOT NULL
                           REFERENCES lmw_package_proposals(id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_payment_id      TEXT NOT NULL UNIQUE,
  provider_preference_id   TEXT,
  provider_status          TEXT NOT NULL,
  disposition              TEXT NOT NULL CHECK (
    disposition IN (
      'pending',
      'failed',
      'accepted',
      'duplicate_review',
      'refunded',
      'charged_back'
    )
  ),
  amount_cents             INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                 TEXT NOT NULL,
  provider_created_at      TEXT,
  first_seen_at            TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_payment_attempts_proposal
  ON lmw_payment_attempts(proposal_id, first_seen_at ASC);

CREATE INDEX IF NOT EXISTS idx_lmw_payment_attempts_disposition
  ON lmw_payment_attempts(disposition, updated_at DESC);

-- Conserva como intento aceptado el pago canónico conocido antes de esta
-- migración. Los pagos adicionales históricos se reparan de forma explícita
-- después de desplegar, porque la tabla anterior no podía representarlos.
INSERT OR IGNORE INTO lmw_payment_attempts (
  id,
  proposal_id,
  provider,
  provider_payment_id,
  provider_preference_id,
  provider_status,
  disposition,
  amount_cents,
  currency,
  provider_created_at,
  first_seen_at,
  updated_at
)
SELECT
  'backfill-' || provider || '-' || provider_payment_id,
  id,
  provider,
  provider_payment_id,
  provider_preference_id,
  COALESCE(last_provider_status, status),
  CASE
    WHEN last_provider_status = 'refunded' THEN 'refunded'
    WHEN last_provider_status = 'charged_back' THEN 'charged_back'
    WHEN status = 'paid' THEN 'accepted'
    WHEN status = 'payment_failed' THEN 'failed'
    ELSE 'pending'
  END,
  amount_cents,
  currency,
  paid_at,
  COALESCE(paid_at, updated_at),
  updated_at
FROM lmw_package_proposals
WHERE provider_payment_id IS NOT NULL;
