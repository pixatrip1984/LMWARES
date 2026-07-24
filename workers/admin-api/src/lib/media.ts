import type { Bindings } from '../env';

/**
 * URL pública de una imagen para previsualización en el admin.
 * Usa el CDN (MEDIA_BASE_URL) si está configurado; si no, el proxy /media del
 * Public API. Las imágenes de publicaciones son públicas por naturaleza.
 */
export function mediaUrl(env: Bindings, key: string): string {
  const cdn = env.MEDIA_BASE_URL?.trim();
  if (cdn) return `${cdn.replace(/\/$/, '')}/${key}`;
  const base = (env.PUBLIC_API_URL || 'http://127.0.0.1:8887').replace(/\/$/, '');
  return `${base}/media/${key}`;
}
