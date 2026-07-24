/** Configuración del frontend público. Solo valores públicos (VITE_*). */
export const config = {
  apiUrl: import.meta.env.VITE_PUBLIC_API_URL ?? 'http://127.0.0.1:8887',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',
};
