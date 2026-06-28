-- 0001_seed.sql — Datos de ejemplo para desarrollo local.
-- Ejecutar DESPUÉS de aplicar las migraciones:
--   npm run db:seed:local
-- IDs en formato UUID v4 para ser compatibles con la validación de la API.

-- Usuario admin de ejemplo (cambia el email por el tuyo en Cloudflare Access).
INSERT OR IGNORE INTO admin_users (id, email, name, role, active, last_login_at, created_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin@example.com', 'Admin Demo', 'owner', 1, NULL, '2026-01-01T00:00:00.000Z');

-- Archivos (metadatos; sube los binarios reales a R2 con las mismas keys).
INSERT OR IGNORE INTO file_assets (id, key, bucket, content_type, size_bytes, original_name, checksum, created_by, created_at)
VALUES
  ('66666666-6666-4666-8666-666666666666', 'publications/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666.jpg', 'starter-media', 'image/jpeg', 102400, 'portada-1.jpg', NULL, 'admin@example.com', '2026-01-01T00:00:00.000Z'),
  ('77777777-7777-4777-8777-777777777777', 'publications/22222222-2222-4222-8222-222222222222/77777777-7777-4777-8777-777777777777.jpg', 'starter-media', 'image/jpeg', 98304, 'portada-2.jpg', NULL, 'admin@example.com', '2026-01-01T00:00:00.000Z');

-- Publicaciones de ejemplo (publicadas).
INSERT OR IGNORE INTO publications (id, slug, title, summary, body, status, cover_image_id, metadata, sort_order, published_at, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'bienvenida', 'Publicación de bienvenida', 'Item de ejemplo del catálogo base.', 'Cuerpo de ejemplo en texto plano o markdown.', 'published', '66666666-6666-4666-8666-666666666666', '{"category":"demo","featured":true}', 0, '2026-01-02T10:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-02T10:00:00.000Z'),
  ('22222222-2222-4222-8222-222222222222', 'segundo-item', 'Segundo item', 'Otro ejemplo para probar el listado.', NULL, 'published', '77777777-7777-4777-8777-777777777777', '{"category":"demo"}', 1, '2026-01-03T10:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-03T10:00:00.000Z');

-- Imágenes de galería.
INSERT OR IGNORE INTO publication_images (id, publication_id, file_asset_id, alt, position, created_at)
VALUES
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', 'Imagen de bienvenida', 0, '2026-01-02T10:00:00.000Z'),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', 'Segunda imagen', 0, '2026-01-03T10:00:00.000Z');

-- Solicitud de ejemplo.
INSERT OR IGNORE INTO requests (id, type, status, publication_id, contact_name, contact_email, contact_phone, message, payload, source, created_at, updated_at)
VALUES
  ('55555555-5555-4555-8555-555555555555', 'contact', 'new', '11111111-1111-4111-8111-111111111111', 'Cliente Demo', 'cliente@example.com', '+52 55 1234 5678', 'Hola, me interesa este item.', '{}', 'public-web', '2026-01-04T12:00:00.000Z', '2026-01-04T12:00:00.000Z');

-- Historial + auditoría de ejemplo.
INSERT OR IGNORE INTO status_history (id, entity_type, entity_id, from_status, to_status, changed_by, reason, created_at)
VALUES ('99999999-9999-4999-8999-999999999999', 'publication', '11111111-1111-4111-8111-111111111111', 'draft', 'published', 'admin@example.com', 'Publicación inicial', '2026-01-02T10:00:00.000Z');

INSERT OR IGNORE INTO audit_events (id, actor_type, actor_id, action, entity_type, entity_id, metadata, ip, user_agent, created_at)
VALUES ('88888888-8888-4888-8888-888888888888', 'admin', 'admin@example.com', 'publication.publish', 'publication', '11111111-1111-4111-8111-111111111111', '{}', NULL, NULL, '2026-01-02T10:00:00.000Z');
