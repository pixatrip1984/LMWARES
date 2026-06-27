/** Configuración del frontend público. Solo valores públicos (VITE_*). */
export const config = {
  apiUrl: import.meta.env.VITE_PUBLIC_API_URL ?? 'http://localhost:8787',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',
};
