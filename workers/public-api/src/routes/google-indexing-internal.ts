import { Hono } from 'hono';
import { AppError, GoogleIndexingClient } from '@starter/domain';
import type { Bindings, Variables } from '../env';

/**
 * Ruta interna, sólo llamada por el Admin API con el mismo bearer token
 * compartido (`OPS_RECOVERY_TOKEN`) usado para reconciliación de pagos.
 * Los secretos del service account (`GOOGLE_INDEXING_CLIENT_EMAIL` /
 * `GOOGLE_INDEXING_PRIVATE_KEY`) sólo existen en este Worker; el Admin API
 * nunca los ve. Es best-effort por diseño: si faltan credenciales o Google
 * falla, responde `ok:false` con un motivo en vez de un error HTTP, para que
 * el llamador nunca bloquee la publicación de un sitio por esto.
 */
export const googleIndexingInternal = new Hono<{ Bindings: Bindings; Variables: Variables }>();

googleIndexingInternal.use('/google-indexing/*', async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!(await safeTokenEqual(token, c.env.OPS_RECOVERY_TOKEN ?? ''))) {
    throw AppError.forbidden('Notificación de indexado no autorizada.');
  }
  await next();
});

googleIndexingInternal.post('/google-indexing/notify', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    throw new AppError('validation_error', 'Falta la URL a notificar.');
  }

  const clientEmail = c.env.GOOGLE_INDEXING_CLIENT_EMAIL?.trim();
  const privateKeyPem = c.env.GOOGLE_INDEXING_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKeyPem) {
    return c.json({ ok: false, url, reason: 'Google Indexing no está configurado en este entorno.' });
  }

  const client = new GoogleIndexingClient({ clientEmail, privateKeyPem });
  const result = await client.notifyUrlUpdated(url);
  return c.json(result);
});

async function safeTokenEqual(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < left.length && index < right.length; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }
  return diff === 0;
}
