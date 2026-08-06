-- Antes, la preferencia de mantenimiento del intake ('later'/'none'/'basic'/
-- 'advanced') era puramente informativa: el operador tecleaba cualquier monto
-- mensual sin relación real con lo que el cliente había elegido. Esta columna
-- registra el plan REAL ya decidido para la oferta:
--   - Si el cliente eligió un plan concreto en el configurador ('none'/'basic'/
--     'advanced'), se copia aquí al emitir la oferta y el monto mensual se
--     deriva de ese plan (ya no es un número libre del operador).
--   - Si el cliente eligió "configurar luego" ('later'), queda NULL: la
--     mensualidad no puede autorizarse hasta que el cliente elige un plan real
--     en la pantalla de autorización, momento en el que se rellena esta
--     columna y se actualiza monthly_amount_cents.
ALTER TABLE lmw_commercial_offers ADD COLUMN maintenance_plan_selected TEXT
  CHECK (maintenance_plan_selected IS NULL OR maintenance_plan_selected IN ('none', 'basic', 'advanced'));
