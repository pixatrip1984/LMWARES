-- Ofertas comerciales inmutables y versionadas. Una nueva versión reemplaza
-- la anterior sin borrar el historial aceptable como evidencia contractual.

CREATE TABLE IF NOT EXISTS lmw_commercial_offers (
  id                              TEXT PRIMARY KEY,
  intake_id                       TEXT NOT NULL
                                  REFERENCES lmw_package_intakes(id) ON DELETE CASCADE,
  user_id                         TEXT NOT NULL
                                  REFERENCES lmw_users(id) ON DELETE CASCADE,
  version                         INTEGER NOT NULL CHECK (version > 0),
  status                          TEXT NOT NULL CHECK (
    status IN ('issued', 'accepted', 'superseded', 'declined', 'expired')
  ),
  plan                            TEXT NOT NULL CHECK (plan IN ('starter', 'pro')),
  modules                         TEXT NOT NULL,
  marketing                       INTEGER NOT NULL DEFAULT 0 CHECK (marketing IN (0, 1)),
  implementation_amount_cents     INTEGER NOT NULL CHECK (implementation_amount_cents > 0),
  monthly_amount_cents            INTEGER NOT NULL CHECK (monthly_amount_cents >= 0),
  currency                        TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  scope_summary                   TEXT NOT NULL,
  implementation_description      TEXT NOT NULL,
  recurring_description           TEXT NOT NULL,
  maintenance_start_policy        TEXT NOT NULL DEFAULT 'on_go_live'
                                  CHECK (maintenance_start_policy = 'on_go_live'),
  terms_version                   TEXT NOT NULL,
  terms_snapshot                  TEXT NOT NULL,
  valid_until                     TEXT NOT NULL,
  issued_by                       TEXT NOT NULL,
  issued_at                       TEXT NOT NULL,
  accepted_at                     TEXT,
  created_at                      TEXT NOT NULL,
  updated_at                      TEXT NOT NULL,
  UNIQUE (intake_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_commercial_offers_one_issued
  ON lmw_commercial_offers(intake_id)
  WHERE status = 'issued';

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_offers_user
  ON lmw_commercial_offers(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_offers_intake
  ON lmw_commercial_offers(intake_id, version DESC);
