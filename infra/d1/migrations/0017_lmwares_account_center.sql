-- Centro de cuenta público: lectura persistente de notificaciones por usuario.

ALTER TABLE lmw_notifications ADD COLUMN read_at TEXT;

CREATE INDEX IF NOT EXISTS idx_lmw_notifications_user
  ON lmw_notifications(user_id, created_at DESC);
