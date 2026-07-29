-- Propuestas pagadas de LMWares y estado reconciliado con el proveedor.
-- El monto de prueba se fija exclusivamente en el Worker y nunca en el navegador.

CREATE TABLE IF NOT EXISTS lmw_package_proposals (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES lmw_users(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL CHECK (plan IN ('starter', 'pro')),
  modules                TEXT NOT NULL,
  marketing              INTEGER NOT NULL DEFAULT 0 CHECK (marketing IN (0, 1)),
  status                 TEXT NOT NULL CHECK (
    status IN (
      'approved_test',
      'checkout_creating',
      'checkout_failed',
      'payment_pending',
      'payment_failed',
      'paid'
    )
  ),
  amount_cents           INTEGER NOT NULL CHECK (amount_cents > 0),
  currency               TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  pricing_version        TEXT NOT NULL,
  package_snapshot       TEXT NOT NULL,
  provider               TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_preference_id TEXT UNIQUE,
  provider_payment_id    TEXT,
  checkout_url           TEXT,
  last_provider_status   TEXT,
  paid_at                TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_package_proposals_user
  ON lmw_package_proposals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_package_proposals_status
  ON lmw_package_proposals(status, updated_at DESC);
