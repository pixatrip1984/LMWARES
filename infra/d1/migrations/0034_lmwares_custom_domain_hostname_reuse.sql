-- Permite volver a registrar un hostname después de retirar su registro
-- anterior, conservando el historial de dominios retirados.

DROP INDEX IF EXISTS idx_lmw_custom_domains_project_type_active;
DROP INDEX IF EXISTS idx_lmw_custom_domains_user;
DROP INDEX IF EXISTS idx_lmw_custom_domains_project;
DROP INDEX IF EXISTS idx_lmw_custom_domains_active_hostname;

ALTER TABLE lmw_custom_domains RENAME TO lmw_custom_domains_legacy;

CREATE TABLE lmw_custom_domains (
  id                       TEXT PRIMARY KEY,
  client_project_id        TEXT NOT NULL
                           REFERENCES lmw_starter_client_projects(id) ON DELETE RESTRICT,
  user_id                  TEXT NOT NULL
                           REFERENCES lmw_users(id) ON DELETE RESTRICT,
  hostname                 TEXT NOT NULL,
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

INSERT INTO lmw_custom_domains (
  id,
  client_project_id,
  user_id,
  hostname,
  type,
  status,
  verification_method,
  verification_token_hash,
  dns_instructions,
  provider,
  external_id,
  certificate_status,
  last_error,
  verified_at,
  activated_at,
  removed_at,
  created_at,
  updated_at
)
SELECT
  id,
  client_project_id,
  user_id,
  hostname,
  type,
  status,
  verification_method,
  verification_token_hash,
  dns_instructions,
  provider,
  external_id,
  certificate_status,
  last_error,
  verified_at,
  activated_at,
  removed_at,
  created_at,
  updated_at
FROM lmw_custom_domains_legacy;

DROP TABLE lmw_custom_domains_legacy;

CREATE UNIQUE INDEX idx_lmw_custom_domains_project_type_active
  ON lmw_custom_domains(client_project_id, type)
  WHERE status <> 'removed';

CREATE UNIQUE INDEX idx_lmw_custom_domains_hostname_active
  ON lmw_custom_domains(hostname)
  WHERE status <> 'removed';

CREATE INDEX idx_lmw_custom_domains_user
  ON lmw_custom_domains(user_id, created_at DESC);

CREATE INDEX idx_lmw_custom_domains_project
  ON lmw_custom_domains(client_project_id, status, created_at DESC);

CREATE INDEX idx_lmw_custom_domains_active_hostname
  ON lmw_custom_domains(hostname)
  WHERE status = 'active';
