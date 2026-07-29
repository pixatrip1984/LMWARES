-- Outbox transaccional para notificaciones al cliente.

CREATE TABLE IF NOT EXISTS lmw_notifications (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES lmw_users(id) ON DELETE CASCADE,
  intake_id           TEXT REFERENCES lmw_free_intakes(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL DEFAULT 'email',
  template            TEXT NOT NULL,
  to_address          TEXT NOT NULL,
  dedupe_key          TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending',
  attempt             INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 5,
  next_attempt_at     TEXT,
  lease_until         TEXT,
  claimed_by          TEXT,
  provider_message_id TEXT,
  payload             TEXT NOT NULL DEFAULT '{}',
  error_code          TEXT,
  error_message       TEXT,
  sent_at             TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_notifications_dispatch
  ON lmw_notifications(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_lmw_notifications_intake
  ON lmw_notifications(intake_id, created_at);
