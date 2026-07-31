import { AppError } from '@starter/domain';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../env';
import {
  broadenMapSearchQuery,
  mapNominatimResults,
  mapPhotonResults,
  normalizeMapCoordinate,
  normalizeMapSearchQuery,
} from '../lib/map-search';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';

export const mapLocations = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const PUBLIC_NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const PUBLIC_PHOTON_URL = 'https://photon.komoot.io';
const SEARCH_CACHE_SECONDS = 7 * 24 * 60 * 60;
const SUGGEST_CACHE_SECONDS = 24 * 60 * 60;
const PROVIDER_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.6',
  Referer: 'https://contratar.lmwares.com/',
  'User-Agent': 'LMWares-Free-Location/1.1 (+https://lmwares.com; soporte@lmwares.com)',
};

mapLocations.get('/search', async (c) => {
  assertTrustedPublicOrigin(c);
  await requirePublicSession(c);

  const query = normalizeMapSearchQuery(c.req.query('q'));
  if (query.length < 3) {
    throw new AppError('validation_error', 'Escribe al menos tres caracteres para buscar una ubicación.');
  }

  const providerUrl = normalizeProviderUrl(c.env.MAP_SEARCH_BASE_URL, PUBLIC_NOMINATIM_URL);
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

  const raw = await fetchProviderJson(upstreamUrl);

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

mapLocations.get('/suggest', async (c) => {
  assertTrustedPublicOrigin(c);
  await requirePublicSession(c);

  const query = normalizeMapSearchQuery(c.req.query('q'));
  if (query.length < 3) {
    throw new AppError('validation_error', 'Escribe al menos tres caracteres para mostrar sugerencias.');
  }

  const latitude = normalizeMapCoordinate(c.req.query('lat'), -90, 90);
  const longitude = normalizeMapCoordinate(c.req.query('lon'), -180, 180);
  const hasBias = latitude !== null && longitude !== null;
  const providerUrl = normalizeProviderUrl(c.env.MAP_SUGGEST_BASE_URL, PUBLIC_PHOTON_URL);
  const biasKey = hasBias ? `${latitude.toFixed(2)},${longitude.toFixed(2)}` : 'none';
  const cacheKey = new Request(
    `https://map-search-cache.lmwares.internal/suggest?provider=${encodeURIComponent(providerUrl)}&bias=${biasKey}&q=${encodeURIComponent(query.toLocaleLowerCase('es-MX'))}`,
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) return cachedMapResponse(cached, 'HIT', 60);

  const upstreamUrl = new URL('api/', `${providerUrl}/`);
  upstreamUrl.searchParams.set('q', query);
  upstreamUrl.searchParams.set('limit', '5');
  if (hasBias) {
    upstreamUrl.searchParams.set('lat', latitude.toFixed(6));
    upstreamUrl.searchParams.set('lon', longitude.toFixed(6));
    upstreamUrl.searchParams.set('zoom', '12');
    upstreamUrl.searchParams.set('location_bias_scale', '0.2');
  }

  const raw = await fetchProviderJson(upstreamUrl);
  let results = mapPhotonResults(raw);
  let approximate = false;
  const broaderQuery = broadenMapSearchQuery(query);
  if (results.length === 0 && broaderQuery.length >= 3 && broaderQuery !== query) {
    upstreamUrl.searchParams.set('q', broaderQuery);
    results = mapPhotonResults(await fetchProviderJson(upstreamUrl));
    approximate = results.length > 0;
  }
  const serialized = JSON.stringify({
    results,
    approximate,
    attribution: '© OpenStreetMap contributors · Photon',
  });
  c.executionCtx.waitUntil(caches.default.put(cacheKey, new Response(serialized, {
    headers: {
      'Cache-Control': `public, max-age=${SUGGEST_CACHE_SECONDS}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })));
  return mapResponse(serialized, 'MISS', 60);
});

mapLocations.get('/reverse', async (c) => {
  assertTrustedPublicOrigin(c);
  await requirePublicSession(c);

  const latitude = normalizeMapCoordinate(c.req.query('lat'), -90, 90);
  const longitude = normalizeMapCoordinate(c.req.query('lon'), -180, 180);
  if (latitude === null || longitude === null) {
    throw new AppError('validation_error', 'El punto seleccionado no contiene coordenadas válidas.');
  }

  const providerUrl = normalizeProviderUrl(c.env.MAP_SEARCH_BASE_URL, PUBLIC_NOMINATIM_URL);
  const cacheKey = new Request(
    `https://map-search-cache.lmwares.internal/reverse?provider=${encodeURIComponent(providerUrl)}&lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`,
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) return cachedMapResponse(cached, 'HIT', 300);

  const upstreamUrl = new URL('reverse', `${providerUrl}/`);
  upstreamUrl.search = new URLSearchParams({
    lat: latitude.toFixed(6),
    lon: longitude.toFixed(6),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '18',
    'accept-language': 'es-MX,es',
  }).toString();

  const raw = await fetchProviderJson(upstreamUrl);
  const result = mapNominatimResults([raw])[0] ?? null;
  const serialized = JSON.stringify({
    result,
    attribution: '© OpenStreetMap contributors',
  });
  c.executionCtx.waitUntil(caches.default.put(cacheKey, new Response(serialized, {
    headers: {
      'Cache-Control': `public, max-age=${SEARCH_CACHE_SECONDS}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })));
  return mapResponse(serialized, 'MISS', 300);
});

async function fetchProviderJson(url: URL): Promise<unknown> {
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: PROVIDER_HEADERS });
  } catch {
    throw new AppError('internal_error', 'El buscador de ubicaciones no está disponible en este momento.');
  }

  if (!upstream.ok) {
    throw new AppError('internal_error', 'OpenStreetMap no pudo completar la consulta en este momento.');
  }

  try {
    return await upstream.json();
  } catch {
    throw new AppError('internal_error', 'OpenStreetMap devolvió una respuesta no válida.');
  }
}

function cachedMapResponse(cached: Response, cacheStatus: string, browserMaxAge: number): Response {
  return new Response(cached.body, {
    headers: {
      'Cache-Control': `private, max-age=${browserMaxAge}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-LMWares-Map-Cache': cacheStatus,
    },
  });
}

function mapResponse(serialized: string, cacheStatus: string, browserMaxAge: number): Response {
  return new Response(serialized, {
    headers: {
      'Cache-Control': `private, max-age=${browserMaxAge}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-LMWares-Map-Cache': cacheStatus,
    },
  });
}

function normalizeProviderUrl(value: string | undefined, fallback: string): string {
  const candidate = (value || fallback).trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return fallback;
  }
  return parsed.protocol === 'https:' ? parsed.toString().replace(/\/+$/, '') : fallback;
}
