import { AppError } from '@starter/domain';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../env';
import { mapNominatimResults, normalizeMapSearchQuery } from '../lib/map-search';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';

export const mapLocations = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const PUBLIC_NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const SEARCH_CACHE_SECONDS = 7 * 24 * 60 * 60;

mapLocations.get('/search', async (c) => {
  assertTrustedPublicOrigin(c);
  await requirePublicSession(c);

  const query = normalizeMapSearchQuery(c.req.query('q'));
  if (query.length < 3) {
    throw new AppError('validation_error', 'Escribe al menos tres caracteres para buscar una ubicación.');
  }

  const providerUrl = normalizeProviderUrl(c.env.MAP_SEARCH_BASE_URL);
  const cacheKey = new Request(
    `https://map-search-cache.lmwares.internal/search?provider=${encodeURIComponent(providerUrl)}&q=${encodeURIComponent(query.toLocaleLowerCase('es-MX'))}`,
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Type': 'application/json; charset=UTF-8',
        'X-LMWares-Map-Cache': 'HIT',
      },
    });
  }

  const upstreamUrl = new URL('search', `${providerUrl}/`);
  upstreamUrl.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
    'accept-language': 'es-MX,es',
  }).toString();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es-MX,es;q=0.9',
        Referer: 'https://contratar.lmwares.com/',
        'User-Agent': 'LMWares-Free-Location/1.0 (+https://lmwares.com; soporte@lmwares.com)',
      },
    });
  } catch {
    throw new AppError('internal_error', 'El buscador de ubicaciones no está disponible en este momento.');
  }

  if (!upstream.ok) {
    throw new AppError('internal_error', 'OpenStreetMap no pudo completar la búsqueda en este momento.');
  }

  let raw: unknown;
  try {
    raw = await upstream.json();
  } catch {
    throw new AppError('internal_error', 'OpenStreetMap devolvió una respuesta no válida.');
  }

  const payload = {
    results: mapNominatimResults(raw),
    attribution: '© OpenStreetMap contributors',
  };
  const serialized = JSON.stringify(payload);
  c.executionCtx.waitUntil(caches.default.put(cacheKey, new Response(serialized, {
    headers: {
      'Cache-Control': `public, max-age=${SEARCH_CACHE_SECONDS}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })));

  return new Response(serialized, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Content-Type': 'application/json; charset=UTF-8',
      'X-LMWares-Map-Cache': 'MISS',
    },
  });
});

function normalizeProviderUrl(value: string | undefined): string {
  const candidate = (value || PUBLIC_NOMINATIM_URL).trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return PUBLIC_NOMINATIM_URL;
  }
  return parsed.protocol === 'https:' ? parsed.toString().replace(/\/+$/, '') : PUBLIC_NOMINATIM_URL;
}
