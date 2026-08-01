-- Ordenes de cobro reales. Se separan de las propuestas tecnicas de MXN $5
-- para que una oferta aceptada conserve importe, alcance y conciliacion propios.

CREATE TABLE IF NOT EXISTS lmw_billing_orders (
  id                         TEXT PRIMARY KEY,
  purpose                    TEXT NOT NULL CHECK (purpose IN ('implementation', 'cart')),
  commercial_offer_id        TEXT
                             REFERENCES lmw_commercial_offers(id) ON DELETE RESTRICT,
  intake_id                  TEXT
                             REFERENCES lmw_package_intakes(id) ON DELETE RESTRICT,
  user_id                    TEXT NOT NULL
                             REFERENCES lmw_users(id) ON DELETE RESTRICT,
  status                     TEXT NOT NULL CHECK (
    status IN (
      'ready', 'checkout_creating', 'checkout_failed', 'payment_pending',
      'payment_failed', 'paid', 'refunded', 'charged_back', 'canceled'
    )
  ),
  amount_cents               INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                   TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  order_snapshot             TEXT NOT NULL,
  external_reference         TEXT NOT NULL UNIQUE,
  provider                   TEXT NOT NULL DEFAULT 'mercado_pago'
                             CHECK (provider = 'mercado_pago'),
  provider_preference_id     TEXT,
  provider_payment_id        TEXT,
  checkout_url               TEXT,
  checkout_expires_at        TEXT,
  last_provider_status       TEXT,
  payment_review_required    INTEGER NOT NULL DEFAULT 0
                             CHECK (payment_review_required IN (0, 1)),
  paid_at                    TEXT,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  CHECK (
    (purpose = 'implementation' AND commercial_offer_id IS NOT NULL AND intake_id IS NOT NULL)
    OR purpose = 'cart'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_billing_orders_offer
  ON lmw_billing_orders(commercial_offer_id)
  WHERE commercial_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lmw_billing_orders_user
  ON lmw_billing_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_billing_orders_status
  ON lmw_billing_orders(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS lmw_billing_payment_attempts (
  id                       TEXT PRIMARY KEY,
  billing_order_id         TEXT NOT NULL
                           REFERENCES lmw_billing_orders(id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_payment_id      TEXT NOT NULL UNIQUE,
  provider_preference_id   TEXT,
  provider_status          TEXT NOT NULL,
  disposition              TEXT NOT NULL CHECK (
    disposition IN ('pending', 'failed', 'accepted', 'duplicate_review', 'refunded', 'charged_back')
  ),
  amount_cents             INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                 TEXT NOT NULL,
  provider_created_at      TEXT,
  first_seen_at            TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_billing_attempts_order
  ON lmw_billing_payment_attempts(billing_order_id, first_seen_at ASC);

ALTER TABLE lmw_payment_webhook_events
  ADD COLUMN billing_order_id TEXT
                              REFERENCES lmw_billing_orders(id) ON DELETE SET NULL;
