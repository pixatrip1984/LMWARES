-- A paid domain order may be fulfilled exactly once. An uncertain registrar
-- response is escalated to manual_review instead of risking a duplicate buy.
PRAGMA foreign_keys = OFF;
ALTER TABLE lmw_billing_orders RENAME TO lmw_billing_orders_pre_domain;
CREATE TABLE lmw_billing_orders (
  id TEXT PRIMARY KEY, purpose TEXT NOT NULL CHECK (purpose IN ('implementation','cart','domain')),
  commercial_offer_id TEXT REFERENCES lmw_commercial_offers(id) ON DELETE RESTRICT,
  intake_id TEXT REFERENCES lmw_package_intakes(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES lmw_users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('ready','checkout_creating','checkout_failed','payment_pending','payment_failed','paid','refunded','charged_back','canceled')),
  phase INTEGER NOT NULL DEFAULT 1 CHECK (phase IN (1,2,3,4)), amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'), order_snapshot TEXT NOT NULL, external_reference TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago' CHECK (provider = 'mercado_pago'), provider_preference_id TEXT, provider_payment_id TEXT,
  checkout_url TEXT, checkout_expires_at TEXT, last_provider_status TEXT, payment_review_required INTEGER NOT NULL DEFAULT 0 CHECK (payment_review_required IN (0,1)),
  paid_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK ((purpose = 'implementation' AND commercial_offer_id IS NOT NULL AND intake_id IS NOT NULL) OR purpose IN ('cart','domain'))
);
INSERT INTO lmw_billing_orders SELECT * FROM lmw_billing_orders_pre_domain;
DROP TABLE lmw_billing_orders_pre_domain;
CREATE UNIQUE INDEX idx_lmw_billing_orders_offer_phase ON lmw_billing_orders(commercial_offer_id, phase) WHERE commercial_offer_id IS NOT NULL;
CREATE INDEX idx_lmw_billing_orders_user ON lmw_billing_orders(user_id, created_at DESC);
CREATE INDEX idx_lmw_billing_orders_status ON lmw_billing_orders(status, updated_at DESC);
CREATE TABLE lmw_domain_purchase_fulfillments (
  billing_order_id TEXT PRIMARY KEY REFERENCES lmw_billing_orders(id) ON DELETE RESTRICT,
  client_project_id TEXT NOT NULL REFERENCES lmw_starter_client_projects(id) ON DELETE RESTRICT,
  hostname TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('processing','succeeded','manual_review')),
  domain_id TEXT REFERENCES lmw_custom_domains(id) ON DELETE SET NULL, registrar_order_id TEXT,
  last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_lmw_domain_purchase_fulfillments_hostname ON lmw_domain_purchase_fulfillments(hostname);
PRAGMA foreign_keys = ON;
