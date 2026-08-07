// Proxy ligero para la API de Namesilo.
//
// Namesilo bloquea (403) las peticiones que llegan desde IPs de datacenter/cloud
// (incluyendo las IPs de salida de Cloudflare Workers). Esta función Lambda vive
// fuera de Cloudflare y simplemente reenvía la petición tal cual a Namesilo,
// devolviendo la respuesta sin modificar.
//
// Seguridad: requiere un header `X-Proxy-Secret` que debe coincidir con la
// variable de entorno PROXY_SHARED_SECRET. Sin este header válido, se rechaza
// con 401 antes de reenviar nada a Namesilo (evita que terceros usen esta
// función como proxy abierto).
//
// Entrada esperada (invocada vía Lambda Function URL):
//   GET https://<function-url>/<operation>?version=1&type=json&key=...&domains=...
// Salida: el mismo body/status que devuelve Namesilo.

const NAMESILO_API_BASE = 'https://www.namesilo.com/api';

export const handler = async (event) => {
  const sharedSecret = process.env.PROXY_SHARED_SECRET;
  const headers = normalizeHeaders(event.headers ?? {});

  if (!sharedSecret || headers['x-proxy-secret'] !== sharedSecret) {
    return respond(401, { error: 'unauthorized' });
  }

  const rawPath = event.rawPath ?? '/';
  const operation = rawPath.replace(/^\/+/, '');
  if (!operation) {
    return respond(400, { error: 'missing_operation' });
  }

  const queryString = event.rawQueryString ?? '';
  const targetUrl = `${NAMESILO_API_BASE}/${operation}${queryString ? `?${queryString}` : ''}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LMWares-Starter/1.0 (+https://lmwares.com)',
      },
      signal: controller.signal,
    });

    const bodyText = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
      body: bodyText,
    };
  } catch (error) {
    return respond(502, {
      error: 'upstream_unreachable',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

function normalizeHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}
