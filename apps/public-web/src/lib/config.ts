/** Configuración del frontend público. Solo valores públicos (VITE_*). */
const localApiUrl = 'http://127.0.0.1:8887';
const productionApiUrl = 'https://api.lmwares.com';

function defaultApiUrl() {
  if (typeof window === 'undefined') return localApiUrl;
  const hostname = window.location.hostname.toLowerCase();
  const local =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');
  return local ? localApiUrl : productionApiUrl;
}

export const config = {
  apiUrl: import.meta.env.VITE_PUBLIC_API_URL?.trim() || defaultApiUrl(),
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',
};
