-- Registro de proyecto/sitio propiedad del cliente para el flujo Starter,
-- separado del registro interno de desarrollo `lmwares_projects`. El enlace
-- opcional a ese registro interno sigue viviendo en
-- `lmw_starter_work_orders.project_id`; esta tabla nunca lo reemplaza, solo
-- captura la identidad pública del sitio (slug, nombre) que ve el cliente.
--
-- Se crea de forma idempotente en cuanto se confirma la fase 1 de pago
-- (ver `LmwaresStarterWorkOrdersRepository.ensureFromPaidBillingOrder`).

CREATE TABLE IF NOT EXISTS lmw_starter_client_projects (
  id             TEXT PRIMARY KEY,
  work_order_id  TEXT NOT NULL UNIQUE
                 REFERENCES lmw_starter_work_orders(id) ON DELETE RESTRICT,
  intake_id      TEXT NOT NULL UNIQUE
                 REFERENCES lmw_package_intakes(id) ON DELETE RESTRICT,
  user_id        TEXT NOT NULL
                 REFERENCES lmw_users(id) ON DELETE RESTRICT,
  slug           TEXT NOT NULL UNIQUE,
  site_name      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'provisioning'
                 CHECK (status IN ('provisioning', 'active', 'archived')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_starter_client_projects_user
  ON lmw_starter_client_projects(user_id, created_at DESC);

-- Backfill eligible historical phase-1 payments. These sites use a stable
-- work-order-derived slug so the migration never needs to guess at a
-- human-readable name or compete with an existing free-site slug. New
-- projects continue to use the business-name slug in the repository.
INSERT OR IGNORE INTO lmw_slug_reservations
  (slug, intake_id, status, expires_at, created_at, updated_at)
SELECT
  'starter-' || replace(w.id, '-', ''),
  w.intake_id,
  'permanent',
  NULL,
  w.created_at,
  w.updated_at
FROM lmw_starter_work_orders w
JOIN lmw_billing_orders b ON b.id = w.billing_order_id
WHERE b.purpose = 'implementation'
  AND b.phase = 1
  AND b.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM lmw_starter_client_projects p WHERE p.work_order_id = w.id
  );

INSERT OR IGNORE INTO lmw_starter_client_projects
  (id, work_order_id, intake_id, user_id, slug, site_name, status, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  w.id,
  w.intake_id,
  w.user_id,
  'starter-' || replace(w.id, '-', ''),
  COALESCE(NULLIF(i.business_name, ''), 'Tu sitio Starter'),
  'provisioning',
  w.created_at,
  w.updated_at
FROM lmw_starter_work_orders w
JOIN lmw_billing_orders b ON b.id = w.billing_order_id
JOIN lmw_package_intakes i ON i.id = w.intake_id
WHERE b.purpose = 'implementation'
  AND b.phase = 1
  AND b.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM lmw_starter_client_projects p WHERE p.work_order_id = w.id
  )
  AND EXISTS (
    SELECT 1 FROM lmw_slug_reservations r
    WHERE r.slug = 'starter-' || replace(w.id, '-', '')
      AND r.intake_id = w.intake_id
  );
