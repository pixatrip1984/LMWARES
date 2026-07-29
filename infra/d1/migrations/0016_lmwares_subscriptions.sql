-- Suscripciones técnicas de LMWares, independientes del pago único de
-- implementación. El precio real permanecerá fuera de este flujo de prueba.

CREATE TABLE IF NOT EXISTS lmw_subscriptions (
  id                         TEXT PRIMARY KEY,
  proposal_id                TEXT NOT NULL UNIQUE
                             REFERENCES lmw_package_proposals(id) ON DELETE CASCADE,
  user_id                    TEXT NOT NULL
                             REFERENCES lmw_users(id) ON DELETE CASCADE,
  status                     TEXT NOT NULL CHECK (
    status IN (
      'creating',
      'creation_failed',
      'pending_authorization',
      'active',
      'payment_attention',
      'paused',
      'canceled',
      'disputed'
    )
  ),
  amount_cents               INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                   TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  frequency                  INTEGER NOT NULL DEFAULT 1 CHECK (frequency > 0),
  frequency_type             TEXT NOT NULL DEFAULT 'months'
                             CHECK (frequency_type = 'months'),
  pricing_version            TEXT NOT NULL,
  provider                   TEXT NOT NULL DEFAULT 'mercado_pago',
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

CREATE INDEX IF NOT EXISTS idx_lmw_subscriptions_user
  ON lmw_subscriptions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_subscriptions_status
  ON lmw_subscriptions(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS lmw_subscription_charges (
  id                             TEXT PRIMARY KEY,
  subscription_id                TEXT NOT NULL
                                 REFERENCES lmw_subscriptions(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_lmw_subscription_charges_subscription
  ON lmw_subscription_charges(subscription_id, created_at DESC);

ALTER TABLE lmw_payment_webhook_events
  ADD COLUMN subscription_id TEXT REFERENCES lmw_subscriptions(id) ON DELETE SET NULL;
