const localApiUrl = 'http://127.0.0.1:8888';
const productionApiUrl = 'https://admin.lmwares.com';

function isLocalHostname(value: string) {
  const hostname = value.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

export function resolveAdminApiUrl(configuredValue: string | undefined, browserHostname: string) {
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
  env?: { VITE_ADMIN_API_URL?: string };
}).env;
const browserHostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;

export const config = {
  apiUrl: resolveAdminApiUrl(viteEnv?.VITE_ADMIN_API_URL, browserHostname),
};
