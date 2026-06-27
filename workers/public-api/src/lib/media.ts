import type { Context } from 'hono';
import type { Bindings, Variables } from '../env';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Construye la URL pública de un objeto de R2. Usa MEDIA_BASE_URL si está
 * definido (CDN); si no, cae al proxy /media del propio Worker.
 */
export function mediaUrl(c: Ctx, key: string): string {
  const base = c.env.MEDIA_BASE_URL?.trim();
  if (base) return `${base.replace(/\/$/, '')}/${key}`;
  const origin = new URL(c.req.url).origin;
  return `${origin}/media/${key}`;
}
