-- Orden operacional creada únicamente después de confirmar el pago comercial.
-- No inventa un repositorio: el operador enlaza después un proyecto real del
-- registro privado de Oracle.

CREATE TABLE IF NOT EXISTS lmw_starter_work_orders (
  id                    TEXT PRIMARY KEY,
  billing_order_id      TEXT NOT NULL UNIQUE
                        REFERENCES lmw_billing_orders(id) ON DELETE RESTRICT,
  intake_id             TEXT NOT NULL UNIQUE
                        REFERENCES lmw_package_intakes(id) ON DELETE RESTRICT,
  commercial_offer_id   TEXT NOT NULL UNIQUE
                        REFERENCES lmw_commercial_offers(id) ON DELETE RESTRICT,
  user_id               TEXT NOT NULL
                        REFERENCES lmw_users(id) ON DELETE RESTRICT,
  project_id            TEXT
                        REFERENCES lmwares_projects(id) ON DELETE RESTRICT,
  status                TEXT NOT NULL CHECK (
    status IN (
      'awaiting_provisioning', 'in_build', 'client_review',
      'ready_to_publish', 'live', 'canceled'
    )
  ),
  work_snapshot         TEXT NOT NULL,
  assigned_by           TEXT,
  assigned_at           TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lmw_starter_work_orders_status
  ON lmw_starter_work_orders(status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_lmw_starter_work_orders_project
  ON lmw_starter_work_orders(project_id)
  WHERE project_id IS NOT NULL;
