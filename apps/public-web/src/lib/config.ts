/** Configuración del frontend público. Solo valores públicos (VITE_*). */
const localApiUrl = 'http://127.0.0.1:8887';
const productionApiUrl = 'https://api.lmwares.com';

function isLocalHostname(value: string) {
  const hostname = value.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

export function resolvePublicApiUrl(configuredValue: string | undefined, browserHostname: string) {
  const configured = configuredValue?.trim();
  const browserIsLocal = isLocalHostname(browserHostname);
  if (!configured) return browserIsLocal ? localApiUrl : productionApiUrl;

  try {
    const configuredHostname = new URL(configured).hostname;
    if (!browserIsLocal && isLocalHostname(configuredHostname)) return productionApiUrl;
    return configured.replace(/\/+$/, '');
  } catch {
    return browserIsLocal ? localApiUrl : productionApiUrl;
  }
}

const viteEnv = (import.meta as ImportMeta & {
  env?: { VITE_PUBLIC_API_URL?: string; VITE_TURNSTILE_SITE_KEY?: string };
}).env;
const browserHostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;

export const config = {
  apiUrl: resolvePublicApiUrl(viteEnv?.VITE_PUBLIC_API_URL, browserHostname),
  turnstileSiteKey: viteEnv?.VITE_TURNSTILE_SITE_KEY ?? '',
};
