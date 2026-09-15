-- Fase 0 gratuita: el sitio y el ciclo comercial existen antes del primer pago.
-- Las órdenes de trabajo y de pago históricas se conservan sin cambios.

CREATE TABLE IF NOT EXISTS lmw_commercial_demo_lifecycles (
  id                    TEXT PRIMARY KEY,
  intake_id             TEXT NOT NULL UNIQUE REFERENCES lmw_package_intakes(id) ON DELETE RESTRICT,
  commercial_offer_id   TEXT NOT NULL UNIQUE REFERENCES lmw_commercial_offers(id) ON DELETE RESTRICT,
  user_id               TEXT NOT NULL REFERENCES lmw_users(id) ON DELETE RESTRICT,
  slug                  TEXT NOT NULL UNIQUE,
  site_name             TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN (
    'demo_preparing', 'demo_ready', 'phase_1_payment_due', 'in_implementation',
    'client_review', 'ready_to_publish', 'live', 'canceled'
  )),
  demo_asset_key        TEXT,
  demo_published_at     TEXT,
  phase_zero_completed_at TEXT,
  work_order_id         TEXT UNIQUE REFERENCES lmw_starter_work_orders(id) ON DELETE SET NULL,
  oracle_project_id     TEXT REFERENCES lmwares_projects(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_demo_lifecycles_user
  ON lmw_commercial_demo_lifecycles(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lmw_commercial_demo_phases (
  id                    TEXT PRIMARY KEY,
  lifecycle_id          TEXT NOT NULL REFERENCES lmw_commercial_demo_lifecycles(id) ON DELETE CASCADE,
  phase                 INTEGER NOT NULL CHECK (phase BETWEEN 0 AND 4),
  status                TEXT NOT NULL CHECK (status IN ('locked', 'in_progress', 'payment_due', 'payment_confirmed', 'completed')),
  evidence              TEXT,
  started_at            TEXT,
  completed_at          TEXT,
  completed_by          TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE(lifecycle_id, phase)
);

CREATE TABLE IF NOT EXISTS lmw_operational_notifications (
  id                    TEXT PRIMARY KEY,
  event_type            TEXT NOT NULL,
  dedupe_key            TEXT NOT NULL UNIQUE,
  payload               TEXT NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt               INTEGER NOT NULL DEFAULT 0,
  max_attempts          INTEGER NOT NULL DEFAULT 5,
  next_attempt_at       TEXT,
  lease_until           TEXT,
  provider_message_id   TEXT,
  error_message         TEXT,
  sent_at               TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_operational_notifications_dispatch
  ON lmw_operational_notifications(status, next_attempt_at, created_at);
