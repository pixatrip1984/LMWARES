-- Pago de implementación fraccionado en 4 fases del 25% cada una, alineadas
-- con las transiciones existentes de lmw_starter_work_orders:
--   fase 1 -> awaiting_provisioning => in_build (arranque)
--   fase 2 -> in_build => client_review
--   fase 3 -> client_review => ready_to_publish
--   fase 4 -> ready_to_publish => live
--
-- Las órdenes históricas de una sola fase (pago de contado, fase = 1 con el
-- 100% del importe) conservan validez: si no existe una fila para una fase
-- posterior, el gate correspondiente se considera satisfecho.

DROP INDEX IF EXISTS idx_lmw_billing_orders_offer;

ALTER TABLE lmw_billing_orders
  ADD COLUMN phase INTEGER NOT NULL DEFAULT 1 CHECK (phase BETWEEN 1 AND 4);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmw_billing_orders_offer_phase
  ON lmw_billing_orders(commercial_offer_id, phase)
  WHERE commercial_offer_id IS NOT NULL;
