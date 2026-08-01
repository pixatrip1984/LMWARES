-- Selección comercial original del cliente. La oferta final y el WARE se
-- derivan de este registro, pero nunca lo sobreescriben.

CREATE TABLE IF NOT EXISTS lmw_package_intakes (
  id                              TEXT PRIMARY KEY,
  submission_key                  TEXT NOT NULL UNIQUE,
  user_id                         TEXT NOT NULL
                                  REFERENCES lmw_users(id) ON DELETE CASCADE,
  plan                            TEXT NOT NULL CHECK (plan IN ('starter', 'pro')),
  modules                         TEXT NOT NULL,
  marketing                       INTEGER NOT NULL DEFAULT 0 CHECK (marketing IN (0, 1)),
  status                          TEXT NOT NULL CHECK (
    status IN ('submitted', 'scope_review', 'offer_ready', 'declined', 'converted')
  ),
  estimated_implementation_cents INTEGER NOT NULL CHECK (estimated_implementation_cents > 0),
  estimated_monthly_cents        INTEGER NOT NULL CHECK (estimated_monthly_cents >= 0),
  currency                        TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  pricing_version                 TEXT NOT NULL,
  maintenance_start_policy       TEXT NOT NULL DEFAULT 'on_go_live'
                                  CHECK (maintenance_start_policy = 'on_go_live'),
  package_snapshot                TEXT NOT NULL,
  proposal_id                     TEXT UNIQUE
                                  REFERENCES lmw_package_proposals(id) ON DELETE SET NULL,
  reviewed_by                     TEXT,
  reviewed_at                     TEXT,
  review_notes                    TEXT,
  submitted_at                    TEXT NOT NULL,
  created_at                      TEXT NOT NULL,
  updated_at                      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_package_intakes_user
  ON lmw_package_intakes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_package_intakes_review_queue
  ON lmw_package_intakes(status, updated_at ASC);
