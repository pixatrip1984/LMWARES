-- Suscripciones comerciales que comienzan en la compuerta de publicación.
-- Permanecen separadas del ensayo técnico de lmw_subscriptions.

CREATE TABLE IF NOT EXISTS lmw_maintenance_subscriptions (
  id                         TEXT PRIMARY KEY,
  work_order_id              TEXT NOT NULL UNIQUE
                             REFERENCES lmw_starter_work_orders(id) ON DELETE RESTRICT,
  intake_id                  TEXT NOT NULL UNIQUE
                             REFERENCES lmw_package_intakes(id) ON DELETE RESTRICT,
  commercial_offer_id        TEXT NOT NULL UNIQUE
                             REFERENCES lmw_commercial_offers(id) ON DELETE RESTRICT,
  user_id                    TEXT NOT NULL
                             REFERENCES lmw_users(id) ON DELETE RESTRICT,
  status                     TEXT NOT NULL CHECK (
    status IN (
      'creating', 'creation_failed', 'pending_authorization', 'active',
      'payment_attention', 'paused', 'canceled', 'disputed'
    )
  ),
  amount_cents               INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                   TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  frequency                  INTEGER NOT NULL DEFAULT 1 CHECK (frequency = 1),
  frequency_type             TEXT NOT NULL DEFAULT 'months'
                             CHECK (frequency_type = 'months'),
  pricing_version            TEXT NOT NULL,
  subscription_snapshot      TEXT NOT NULL,
  provider                   TEXT NOT NULL DEFAULT 'mercado_pago'
                             CHECK (provider = 'mercado_pago'),
  provider_preapproval_id    TEXT UNIQUE,
  authorization_url          TEXT,
  external_reference         TEXT NOT NULL UNIQUE,
  provider_status            TEXT,
  next_payment_date          TEXT,
  last_authorized_payment_id TEXT,
  last_authorized_status     TEXT,
  authorized_at              TEXT,
  canceled_at                TEXT,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_maintenance_subscriptions_user
  ON lmw_maintenance_subscriptions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_maintenance_subscriptions_status
  ON lmw_maintenance_subscriptions(status, updated_at ASC);

CREATE TABLE IF NOT EXISTS lmw_maintenance_subscription_charges (
  id                             TEXT PRIMARY KEY,
  maintenance_subscription_id    TEXT NOT NULL
                                 REFERENCES lmw_maintenance_subscriptions(id) ON DELETE CASCADE,
  provider                       TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_authorized_payment_id TEXT NOT NULL UNIQUE,
  provider_payment_id            TEXT,
  status                         TEXT NOT NULL,
  summarized                     TEXT,
  amount_cents                   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                       TEXT NOT NULL,
  debit_date                     TEXT,
  retry_attempt                  INTEGER NOT NULL DEFAULT 0 CHECK (retry_attempt >= 0),
  created_at                     TEXT NOT NULL,
  updated_at                     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_maintenance_charges_subscription
  ON lmw_maintenance_subscription_charges(maintenance_subscription_id, created_at DESC);

ALTER TABLE lmw_starter_work_orders ADD COLUMN published_url TEXT;
ALTER TABLE lmw_starter_work_orders ADD COLUMN published_at TEXT;

ALTER TABLE lmw_payment_webhook_events
  ADD COLUMN maintenance_subscription_id TEXT
  REFERENCES lmw_maintenance_subscriptions(id) ON DELETE SET NULL;
