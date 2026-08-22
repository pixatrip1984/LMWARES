-- Códigos de descuento promocionales para el cotizador de paquetes.
-- Un código aplica un porcentaje fijo (5/10/15%) sobre el importe de
-- implementación de un paquete Starter o Pro. La expiración es por tiempo
-- (expires_at) o por cantidad (max_redemptions), nunca ambas a la vez.

CREATE TABLE IF NOT EXISTS lmw_discount_codes (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  discount_percent  INTEGER NOT NULL CHECK (discount_percent IN (5, 10, 15)),
  plan              TEXT CHECK (plan IS NULL OR plan IN ('starter', 'pro')),
  status            TEXT NOT NULL CHECK (
    status IN ('active', 'disabled', 'exhausted', 'expired')
  ),
  max_redemptions   INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count  INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  qr_data           TEXT,
  expires_at        TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (
    (max_redemptions IS NULL) <> (expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lmw_discount_codes_status
  ON lmw_discount_codes(status, created_at DESC);

CREATE TABLE IF NOT EXISTS lmw_discount_redemptions (
  id                TEXT PRIMARY KEY,
  discount_code_id  TEXT NOT NULL
                    REFERENCES lmw_discount_codes(id) ON DELETE RESTRICT,
  intake_id         TEXT
                    REFERENCES lmw_package_intakes(id) ON DELETE SET NULL,
  user_id           TEXT NOT NULL
                    REFERENCES lmw_users(id) ON DELETE CASCADE,
  discount_percent  INTEGER NOT NULL CHECK (discount_percent IN (5, 10, 15)),
  original_cents    INTEGER NOT NULL CHECK (original_cents > 0),
  discounted_cents  INTEGER NOT NULL CHECK (discounted_cents >= 0),
  currency          TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  redeemed_at       TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (discount_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lmw_discount_redemptions_code
  ON lmw_discount_redemptions(discount_code_id, redeemed_at DESC);

-- El canje y el contador viven en la misma transacción de SQLite. La inserción
-- se aborta si el código ya no está disponible; el trigger posterior sólo
-- incrementa el contador después de una inserción válida.
CREATE TRIGGER IF NOT EXISTS trg_lmw_discount_redemption_validate
BEFORE INSERT ON lmw_discount_redemptions
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM lmw_discount_codes
      WHERE id = NEW.discount_code_id
        AND status = 'active'
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
        AND (expires_at IS NULL OR julianday(expires_at) > julianday('now'))
    ) THEN RAISE(ABORT, 'discount code unavailable')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_lmw_discount_redemption_count
AFTER INSERT ON lmw_discount_redemptions
BEGIN
  UPDATE lmw_discount_codes
  SET redemption_count = redemption_count + 1,
      status = CASE
        WHEN max_redemptions IS NOT NULL AND redemption_count + 1 >= max_redemptions
          THEN 'exhausted'
        ELSE 'active'
      END,
      updated_at = NEW.updated_at
  WHERE id = NEW.discount_code_id;
END;

-- Columnas de descuento en el intake: capturan el código aplicado y el
-- importe ya descontado para que el operador lo vea al emitir la oferta.
ALTER TABLE lmw_package_intakes
  ADD COLUMN discount_code TEXT;
ALTER TABLE lmw_package_intakes
  ADD COLUMN discount_percent INTEGER CHECK (discount_percent IS NULL OR discount_percent IN (5, 10, 15));
ALTER TABLE lmw_package_intakes
  ADD COLUMN discount_redemption_id TEXT;
