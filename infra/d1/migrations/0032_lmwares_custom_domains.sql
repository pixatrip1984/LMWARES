-- Dominios personalizados de proyectos Starter.
-- El subdominio *.lmwares.com sigue viviendo en lmw_starter_client_projects y
-- no se reemplaza cuando un dominio propio pasa a estar activo.

CREATE TABLE IF NOT EXISTS lmw_custom_domains (
  id                       TEXT PRIMARY KEY,
  client_project_id        TEXT NOT NULL
                           REFERENCES lmw_starter_client_projects(id) ON DELETE RESTRICT,
  user_id                  TEXT NOT NULL
                           REFERENCES lmw_users(id) ON DELETE RESTRICT,
  hostname                 TEXT NOT NULL UNIQUE,
  type                     TEXT NOT NULL CHECK (type IN ('www', 'app')),
  status                   TEXT NOT NULL DEFAULT 'pending_verification'
                           CHECK (status IN (
                             'draft',
                             'pending_verification',
                             'verified',
                             'provisioning',
                             'active',
                             'failed',
                             'removed'
                           )),
  verification_method      TEXT NOT NULL DEFAULT 'txt'
                           CHECK (verification_method IN ('cname', 'txt')),
  verification_token_hash  TEXT NOT NULL,
  dns_instructions         TEXT NOT NULL DEFAULT '{}',
  provider                 TEXT,
  external_id              TEXT,
  certificate_status       TEXT NOT NULL DEFAULT 'not_requested'
                           CHECK (certificate_status IN ('not_requested', 'pending', 'active', 'failed')),
  last_error               TEXT,
  verified_at              TEXT,
  activated_at             TEXT,
  removed_at               TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_custom_domains_project_type_active
  ON lmw_custom_domains(client_project_id, type)
  WHERE status <> 'removed';

CREATE INDEX IF NOT EXISTS idx_lmw_custom_domains_user
  ON lmw_custom_domains(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_custom_domains_project
  ON lmw_custom_domains(client_project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lmw_custom_domains_active_hostname
  ON lmw_custom_domains(hostname)
  WHERE status = 'active';
