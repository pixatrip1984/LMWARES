-- Identidad pública LMWares y propiedad de solicitudes Free.
-- Google OIDC es el primer proveedor; el esquema permite añadir otros después.

CREATE TABLE IF NOT EXISTS lmw_users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  name        TEXT,
  picture_url TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_users_email
  ON lmw_users(email);

CREATE TABLE IF NOT EXISTS lmw_identities (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES lmw_users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email_at_login   TEXT NOT NULL,
  email_verified   INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  last_login_at    TEXT NOT NULL,
  UNIQUE(provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_lmw_identities_user
  ON lmw_identities(user_id);

CREATE TABLE IF NOT EXISTS lmw_oauth_transactions (
  state_hash    TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  return_to     TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  consumed_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_oauth_transactions_expiry
  ON lmw_oauth_transactions(expires_at);

CREATE TABLE IF NOT EXISTS lmw_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES lmw_users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT,
  last_seen_at TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_sessions_user
  ON lmw_sessions(user_id, expires_at);

ALTER TABLE lmw_free_intakes
  ADD COLUMN user_id TEXT REFERENCES lmw_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lmw_free_intakes_user
  ON lmw_free_intakes(user_id, created_at DESC);
