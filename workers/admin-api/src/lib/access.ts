import { AppError } from '@starter/domain';

/**
 * Verificación de JWT de Cloudflare Access (RS256) usando Web Crypto.
 * - Descarga el JWKS del equipo (cacheado por isolate).
 * - Verifica firma, expiración y que el `aud` coincida con la app de Access.
 *
 * Doc: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */
export interface AccessClaims {
  email?: string;
  name?: string;
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
}

async function getJwks(teamDomain: string): Promise<Jwk[]> {
  const url = `${teamDomain.replace(/\/$/, '')}/cdn-cgi/access/certs`;
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  const res = await fetch(url);
  if (!res.ok) throw AppError.unauthorized('No se pudo obtener el JWKS de Access.');
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = data.keys ?? [];
  jwksCache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

/** Verifica el token y devuelve sus claims, o lanza AppError 401. */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  expectedAud: string,
): Promise<AccessClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw AppError.unauthorized('Token de Access mal formado.');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeJson<{ kid?: string; alg?: string }>(headerB64);
  if (header.alg !== 'RS256') throw AppError.unauthorized('Algoritmo de token no soportado.');

  const keys = await getJwks(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw AppError.unauthorized('Clave de firma desconocida.');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signed);
  if (!valid) throw AppError.unauthorized('Firma de token inválida.');

  const claims = decodeJson<AccessClaims>(payloadB64);
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < now) throw AppError.unauthorized('Token de Access expirado.');

  const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!auds.includes(expectedAud)) throw AppError.unauthorized('AUD de Access no coincide.');

  return claims;
}
