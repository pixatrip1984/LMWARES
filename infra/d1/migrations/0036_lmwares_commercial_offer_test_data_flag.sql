-- Marca ofertas comerciales generadas como pruebas manuales durante el
-- desarrollo (no clientes reales), para poder excluirlas de los cálculos de
-- incoherencias del preflight de lanzamiento sin borrar el historial ni
-- tocar montos/estados reales.

ALTER TABLE lmw_commercial_offers
  ADD COLUMN is_test_data INTEGER NOT NULL DEFAULT 0 CHECK (is_test_data IN (0, 1));

-- Ofertas de prueba conocidas (importe de prueba $10 MXN, documentadas en el
-- preflight de lanzamiento del 2026-08-07):
UPDATE lmw_commercial_offers
SET is_test_data = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  '16b2d538-b17c-4496-9640-cbb45a8284d2',
  '06aa8c9e-9d5b-42d6-9a92-05e420fb97c7'
);
