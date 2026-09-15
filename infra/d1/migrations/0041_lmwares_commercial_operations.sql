-- Operaciones comerciales canónicas para contratación autónoma, asistida e interna.
--
-- `lmw_package_intakes` permanece como proyección heredada: su `user_id NOT NULL`
-- y sus referencias ya existentes no permiten usarla para un prospecto que todavía
-- no ha demostrado identidad. Cada intake antiguo queda enlazado a una operación.

CREATE TABLE IF NOT EXISTS lmw_commercial_people (
  id                    TEXT PRIMARY KEY,
  display_name          TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lmw_commercial_email_identities (
  id                    TEXT PRIMARY KEY,
  email_normalized      TEXT NOT NULL UNIQUE,
  verified_user_id      TEXT UNIQUE REFERENCES lmw_users(id) ON DELETE SET NULL,
  verified_at           TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lmw_commercial_person_email_identities (
  person_id             TEXT NOT NULL REFERENCES lmw_commercial_people(id) ON DELETE CASCADE,
  email_identity_id     TEXT NOT NULL REFERENCES lmw_commercial_email_identities(id) ON DELETE CASCADE,
  relationship          TEXT NOT NULL DEFAULT 'contact' CHECK (relationship IN ('contact', 'representative', 'billing')),
  is_primary            INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  PRIMARY KEY (person_id, email_identity_id)
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_person_emails_identity
  ON lmw_commercial_person_email_identities(email_identity_id, person_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_commercial_person_emails_one_primary
  ON lmw_commercial_person_email_identities(person_id)
  WHERE is_primary = 1;

CREATE TABLE IF NOT EXISTS lmw_commercial_businesses (
  id                    TEXT PRIMARY KEY,
  legal_name            TEXT,
  trade_name            TEXT NOT NULL,
  country_code          TEXT NOT NULL DEFAULT 'MX',
  tax_identifier        TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_businesses_name
  ON lmw_commercial_businesses(trade_name, created_at DESC);

CREATE TABLE IF NOT EXISTS lmw_commercial_business_representatives (
  business_id           TEXT NOT NULL REFERENCES lmw_commercial_businesses(id) ON DELETE CASCADE,
  person_id             TEXT NOT NULL REFERENCES lmw_commercial_people(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL DEFAULT 'representative' CHECK (role IN ('primary_representative', 'representative', 'contact')),
  active                INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  PRIMARY KEY (business_id, person_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_commercial_businesses_one_primary_representative
  ON lmw_commercial_business_representatives(business_id)
  WHERE role = 'primary_representative' AND active = 1;

CREATE TABLE IF NOT EXISTS lmw_sales_actors (
  id                    TEXT PRIMARY KEY,
  access_subject        TEXT,
  email_normalized      TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_sales_actors_access_subject
  ON lmw_sales_actors(access_subject)
  WHERE access_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS lmw_commercial_operations (
  id                    TEXT PRIMARY KEY,
  public_reference      TEXT NOT NULL UNIQUE,
  origin_channel        TEXT NOT NULL CHECK (origin_channel IN ('self_service', 'seller_assisted', 'internal')),
  status                TEXT NOT NULL CHECK (status IN (
    'draft', 'needs_scope', 'offer_ready', 'presented', 'awaiting_identity',
    'accepted', 'phase_zero_in_progress', 'phase_zero_customer_review',
    'awaiting_continuation', 'awaiting_payment', 'implementation_in_progress',
    'completed', 'declined', 'lost', 'cancelled', 'expired', 'manual_hold'
  )),
  primary_person_id     TEXT REFERENCES lmw_commercial_people(id) ON DELETE SET NULL,
  primary_business_id   TEXT REFERENCES lmw_commercial_businesses(id) ON DELETE SET NULL,
  created_by_actor_id   TEXT REFERENCES lmw_sales_actors(id) ON DELETE SET NULL,
  current_proposal_id   TEXT,
  current_contract_id   TEXT,
  workflow_version      INTEGER NOT NULL DEFAULT 1,
  draft_revision        INTEGER NOT NULL DEFAULT 1,
  row_version           INTEGER NOT NULL DEFAULT 1,
  requirement_brief     TEXT NOT NULL DEFAULT '{}',
  capability_policy_ref TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  presented_at          TEXT,
  accepted_at           TEXT,
  closed_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_operations_status
  ON lmw_commercial_operations(status, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_lmw_commercial_operations_person
  ON lmw_commercial_operations(primary_person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmw_commercial_operations_business
  ON lmw_commercial_operations(primary_business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lmw_commercial_operation_intake_links (
  operation_id          TEXT NOT NULL UNIQUE REFERENCES lmw_commercial_operations(id) ON DELETE CASCADE,
  intake_id             TEXT NOT NULL UNIQUE REFERENCES lmw_package_intakes(id) ON DELETE RESTRICT,
  linked_at             TEXT NOT NULL,
  PRIMARY KEY (operation_id, intake_id)
);

CREATE TABLE IF NOT EXISTS lmw_commercial_operation_assignments (
  id                    TEXT PRIMARY KEY,
  operation_id          TEXT NOT NULL REFERENCES lmw_commercial_operations(id) ON DELETE CASCADE,
  sales_actor_id        TEXT NOT NULL REFERENCES lmw_sales_actors(id) ON DELETE RESTRICT,
  role                  TEXT NOT NULL CHECK (role IN ('originator', 'owner', 'closer', 'participant')),
  assigned_by_actor_id  TEXT REFERENCES lmw_sales_actors(id) ON DELETE SET NULL,
  assignment_reason     TEXT,
  started_at            TEXT NOT NULL,
  ended_at              TEXT,
  created_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_assignments_actor_open
  ON lmw_commercial_operation_assignments(sales_actor_id, ended_at, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmw_commercial_assignments_operation_open
  ON lmw_commercial_operation_assignments(operation_id, ended_at, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_commercial_assignments_one_open_role
  ON lmw_commercial_operation_assignments(operation_id, role)
  WHERE ended_at IS NULL AND role IN ('owner', 'closer');

CREATE TABLE IF NOT EXISTS lmw_commercial_proposals (
  id                    TEXT PRIMARY KEY,
  operation_id          TEXT NOT NULL REFERENCES lmw_commercial_operations(id) ON DELETE CASCADE,
  version               INTEGER NOT NULL CHECK (version > 0),
  status                TEXT NOT NULL CHECK (status IN ('draft', 'review_ready', 'presented', 'awaiting_identity', 'accepted', 'superseded', 'declined', 'expired', 'withdrawn')),
  rendered_document     TEXT NOT NULL,
  document_digest       TEXT NOT NULL,
  scope_snapshot        TEXT NOT NULL,
  pricing_snapshot      TEXT NOT NULL,
  terms_snapshot        TEXT NOT NULL,
  policy_snapshot       TEXT NOT NULL,
  valid_until           TEXT NOT NULL,
  created_by_actor_id   TEXT REFERENCES lmw_sales_actors(id) ON DELETE SET NULL,
  presented_at          TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (operation_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_commercial_proposals_one_active
  ON lmw_commercial_proposals(operation_id)
  WHERE status IN ('presented', 'awaiting_identity');

CREATE TABLE IF NOT EXISTS lmw_commercial_contracts (
  id                    TEXT PRIMARY KEY,
  operation_id          TEXT NOT NULL REFERENCES lmw_commercial_operations(id) ON DELETE RESTRICT,
  proposal_id           TEXT NOT NULL UNIQUE REFERENCES lmw_commercial_proposals(id) ON DELETE RESTRICT,
  contract_reference    TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL CHECK (status IN ('accepted', 'void', 'legacy_evidence')),
  accepted_document     TEXT NOT NULL,
  document_digest       TEXT NOT NULL,
  scope_snapshot        TEXT NOT NULL,
  pricing_snapshot      TEXT NOT NULL,
  terms_snapshot        TEXT NOT NULL,
  policy_snapshot       TEXT NOT NULL,
  accepted_at           TEXT NOT NULL,
  created_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_contracts_operation
  ON lmw_commercial_contracts(operation_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS lmw_commercial_acceptance_sessions (
  id                    TEXT PRIMARY KEY,
  operation_id          TEXT NOT NULL REFERENCES lmw_commercial_operations(id) ON DELETE CASCADE,
  proposal_id           TEXT NOT NULL REFERENCES lmw_commercial_proposals(id) ON DELETE CASCADE,
  initiated_by_actor_id TEXT REFERENCES lmw_sales_actors(id) ON DELETE SET NULL,
  channel               TEXT NOT NULL CHECK (channel IN ('seller_terminal', 'customer_link')),
  capability_hash       TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL CHECK (status IN ('created', 'proof_sent', 'identity_verified', 'accepted', 'expired', 'cancelled')),
  email_identity_id     TEXT REFERENCES lmw_commercial_email_identities(id) ON DELETE SET NULL,
  proof_sent_at         TEXT,
  identity_verified_at  TEXT,
  accepted_at           TEXT,
  expires_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_acceptance_sessions_proposal
  ON lmw_commercial_acceptance_sessions(proposal_id, status, expires_at);

CREATE TABLE IF NOT EXISTS lmw_commercial_acceptances (
  id                    TEXT PRIMARY KEY,
  contract_id           TEXT NOT NULL UNIQUE REFERENCES lmw_commercial_contracts(id) ON DELETE RESTRICT,
  operation_id          TEXT NOT NULL REFERENCES lmw_commercial_operations(id) ON DELETE RESTRICT,
  proposal_id           TEXT NOT NULL UNIQUE REFERENCES lmw_commercial_proposals(id) ON DELETE RESTRICT,
  acceptance_session_id TEXT NOT NULL UNIQUE REFERENCES lmw_commercial_acceptance_sessions(id) ON DELETE RESTRICT,
  accepting_person_id   TEXT NOT NULL REFERENCES lmw_commercial_people(id) ON DELETE RESTRICT,
  email_identity_id     TEXT NOT NULL REFERENCES lmw_commercial_email_identities(id) ON DELETE RESTRICT,
  declarant_name        TEXT NOT NULL,
  authority_declaration TEXT NOT NULL,
  channel               TEXT NOT NULL CHECK (channel IN ('seller_terminal', 'customer_link')),
  evidence_json         TEXT NOT NULL,
  accepted_at           TEXT NOT NULL,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lmw_commercial_operation_events (
  id                    TEXT PRIMARY KEY,
  operation_id          TEXT NOT NULL REFERENCES lmw_commercial_operations(id) ON DELETE CASCADE,
  event_type            TEXT NOT NULL,
  actor_type            TEXT NOT NULL CHECK (actor_type IN ('seller', 'customer', 'admin', 'system', 'runner')),
  actor_id              TEXT,
  dedupe_key            TEXT,
  payload               TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL,
  UNIQUE (operation_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_lmw_commercial_operation_events_timeline
  ON lmw_commercial_operation_events(operation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS lmw_commercial_command_receipts (
  id                    TEXT PRIMARY KEY,
  actor_scope           TEXT NOT NULL,
  command_type          TEXT NOT NULL,
  idempotency_key       TEXT NOT NULL,
  request_digest        TEXT NOT NULL,
  response_snapshot     TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  expires_at            TEXT,
  UNIQUE (actor_scope, command_type, idempotency_key)
);

-- Importación conservadora: no inventa aceptación, contrato ni prueba nueva.
-- Los registros heredados siguen siendo operables mediante sus rutas existentes.
INSERT OR IGNORE INTO lmw_commercial_people (id, display_name, created_at, updated_at)
SELECT 'legacy-person:' || id, COALESCE(NULLIF(name, ''), email), created_at, updated_at
FROM lmw_users;

INSERT OR IGNORE INTO lmw_commercial_email_identities (id, email_normalized, verified_user_id, verified_at, created_at, updated_at)
SELECT 'legacy-email:' || id, lower(trim(email)), id, created_at, created_at, updated_at
FROM lmw_users;

INSERT OR IGNORE INTO lmw_commercial_person_email_identities
  (person_id, email_identity_id, relationship, is_primary, created_at, updated_at)
SELECT 'legacy-person:' || u.id, e.id, 'contact', 1, u.created_at, u.updated_at
FROM lmw_users u
JOIN lmw_commercial_email_identities e ON e.email_normalized = lower(trim(u.email));

INSERT OR IGNORE INTO lmw_commercial_operations
  (id, public_reference, origin_channel, status, primary_person_id, workflow_version,
   draft_revision, row_version, requirement_brief, created_at, updated_at, presented_at, accepted_at, closed_at)
SELECT
  'legacy-operation:' || i.id,
  'LEGACY-' || upper(substr(replace(i.id, '-', ''), 1, 12)),
  'self_service',
  CASE
    WHEN i.status IN ('submitted', 'scope_review') THEN 'needs_scope'
    WHEN i.status = 'offer_ready' AND EXISTS (SELECT 1 FROM lmw_commercial_offers o WHERE o.intake_id = i.id AND o.status = 'accepted') THEN 'accepted'
    WHEN i.status = 'offer_ready' THEN 'presented'
    WHEN i.status = 'declined' THEN 'declined'
    WHEN i.status = 'converted' THEN 'implementation_in_progress'
    ELSE 'manual_hold'
  END,
  'legacy-person:' || i.user_id,
  1, 1, 1,
  json_object('legacyIntakeId', i.id, 'plan', i.plan, 'modules', i.modules, 'marketing', i.marketing),
  i.created_at, i.updated_at,
  CASE WHEN i.status = 'offer_ready' THEN i.updated_at ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM lmw_commercial_offers o WHERE o.intake_id = i.id AND o.status = 'accepted') THEN i.updated_at ELSE NULL END,
  CASE WHEN i.status IN ('declined', 'converted') THEN i.updated_at ELSE NULL END
FROM lmw_package_intakes i;

INSERT OR IGNORE INTO lmw_commercial_operation_intake_links (operation_id, intake_id, linked_at)
SELECT 'legacy-operation:' || id, id, updated_at
FROM lmw_package_intakes;

INSERT OR IGNORE INTO lmw_commercial_operation_events
  (id, operation_id, event_type, actor_type, actor_id, dedupe_key, payload, created_at)
SELECT
  'legacy-event:' || i.id,
  'legacy-operation:' || i.id,
  'commercial.operation.imported',
  'system',
  NULL,
  'legacy-import:' || i.id,
  json_object('intakeId', i.id, 'status', i.status),
  i.updated_at
FROM lmw_package_intakes i;
