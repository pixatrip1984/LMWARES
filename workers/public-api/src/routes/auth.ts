import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import {
  constantTimeEqual,
  decodeJwt,
  randomBase64Url,
  sha256Base64Url,
  sha256Hex,
} from '../lib/auth-crypto';
import {
  assertTrustedPublicOrigin,
  loadPublicSession,
  PUBLIC_SESSION_COOKIE,
} from '../middleware/public-auth';

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const OAUTH_STATE_COOKIE = 'lmw_oauth_state';
const OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

authRoutes.get('/session', async (c) => {
  const session = await loadPublicSession(c);
  c.header('Cache-Control', 'no-store');
  return c.json({
    authenticated: Boolean(session),
    user: session?.user ?? null,
    expiresAt: session?.expiresAt ?? null,
  });
});

authRoutes.get('/google/start', async (c) => {
  assertOAuthConfiguration(c.env);

  const state = randomBase64Url();
  const codeVerifier = randomBase64Url(48);
  const nonce = randomBase64Url();
  const stateHash = await sha256Hex(state);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const returnTo = normalizeReturnTo(c.req.query('returnTo'));
  const expiresAt = new Date(Date.now() + OAUTH_TRANSACTION_TTL_SECONDS * 1000).toISOString();

  await createRepositories(c.env.DB).lmwaresAuth.createOAuthTransaction({
    stateHash,
    provider: 'google',
    codeVerifier,
    nonce,
    returnTo,
    expiresAt,
  });

  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: usesSecureCookies(c.env),
    sameSite: 'Lax',
    path: '/auth/google/callback',
    maxAge: OAUTH_TRANSACTION_TTL_SECONDS,
  });

  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authorizationUrl.search = new URLSearchParams({
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: googleRedirectUri(c.env),
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  return c.redirect(authorizationUrl.toString(), 302);
});

authRoutes.get('/google/callback', async (c) => {
  assertOAuthConfiguration(c.env);

  const providerError = c.req.query('error');
  if (providerError) {
    deleteOAuthStateCookie(c, c.env);
    return c.redirect(`${publicWebUrl(c.env)}/acceso?auth=cancelled`, 302);
  }

  const state = c.req.query('state');
  const code = c.req.query('code');
  const stateCookie = getCookie(c, OAUTH_STATE_COOKIE);
  if (!state || !code || !stateCookie || !constantTimeEqual(state, stateCookie)) {
    deleteOAuthStateCookie(c, c.env);
    throw AppError.unauthorized('La sesión de acceso expiró o no coincide.');
  }

  const transaction = await createRepositories(c.env.DB).lmwaresAuth.consumeOAuthTransaction(
    await sha256Hex(state),
    'google',
  );
  deleteOAuthStateCookie(c, c.env);
  if (!transaction) throw AppError.unauthorized('La sesión de acceso expiró o ya fue utilizada.');

  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(c.env),
      grant_type: 'authorization_code',
      code_verifier: transaction.codeVerifier,
    }),
  });
  const tokenBody = await tokenResponse.json<GoogleTokenResponse>();
  if (!tokenResponse.ok || !tokenBody.id_token) {
    console.error('google_oauth_token_exchange_failed', c.get('requestId'), {
      status: tokenResponse.status,
      error: tokenBody.error,
    });
    throw AppError.unauthorized('Google no pudo completar el acceso.');
  }

  const identity = await validateGoogleIdToken(
    tokenBody.id_token,
    c.env.GOOGLE_OAUTH_CLIENT_ID,
    transaction.nonce,
  );
  const repos = createRepositories(c.env.DB);
  const user = await repos.lmwaresAuth.upsertGoogleIdentity(identity);

  const sessionToken = randomBase64Url(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await repos.lmwaresAuth.createSession({
    userId: user.id,
    tokenHash: await sha256Hex(sessionToken),
    expiresAt,
  });

  setCookie(c, PUBLIC_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: usesSecureCookies(c.env),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  await repos.audit.record({
    actorType: 'public',
    actorId: user.id,
    action: 'lmwares.auth.login',
    entityType: null,
    entityId: null,
    metadata: { provider: 'google' },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });

  return c.redirect(`${publicWebUrl(c.env)}${transaction.returnTo}`, 302);
});

authRoutes.post('/logout', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await loadPublicSession(c);
  if (session) {
    await createRepositories(c.env.DB).lmwaresAuth.revokeSession(session.id);
  }
  deleteCookie(c, PUBLIC_SESSION_COOKIE, {
    path: '/',
    secure: usesSecureCookies(c.env),
  });
  return c.body(null, 204);
});

async function validateGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce: string,
): Promise<{
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
}> {
  const decoded = decodeJwt(idToken);
  await verifyGoogleSignature(decoded);
  const claims = decoded.payload;
  const issuer = stringClaim(claims.iss);
  const audiences = Array.isArray(claims.aud)
    ? claims.aud.filter((value): value is string => typeof value === 'string')
    : [stringClaim(claims.aud)];
  const expiresAt = typeof claims.exp === 'number' ? claims.exp : 0;
  const subject = stringClaim(claims.sub);
  const email = stringClaim(claims.email);
  const nonce = stringClaim(claims.nonce);
  const authorizedParty = stringClaim(claims.azp);

  if (
    !['https://accounts.google.com', 'accounts.google.com'].includes(issuer) ||
    !audiences.includes(clientId) ||
    (audiences.length > 1 && authorizedParty !== clientId) ||
    expiresAt <= Math.floor(Date.now() / 1000) - 60 ||
    !subject ||
    !email ||
    claims.email_verified !== true ||
    !constantTimeEqual(nonce, expectedNonce)
  ) {
    throw AppError.unauthorized('Google devolvió una identidad que no pudo validarse.');
  }

  return {
    subject,
    email,
    emailVerified: true,
    name: stringClaim(claims.name) || null,
    pictureUrl: stringClaim(claims.picture) || null,
  };
}

let cachedGoogleKeys: { keys: GoogleJwk[]; expiresAt: number } | null = null;

async function verifyGoogleSignature(decoded: ReturnType<typeof decodeJwt>): Promise<void> {
  const algorithm = stringClaim(decoded.header.alg);
  const keyId = stringClaim(decoded.header.kid);
  if (algorithm !== 'RS256' || !keyId) {
    throw AppError.unauthorized('La firma de identidad de Google no es válida.');
  }

  const keys = await getGoogleJwks();
  const key = keys.find((candidate) => candidate.kid === keyId && candidate.kty === 'RSA');
  if (!key) throw AppError.unauthorized('Google devolvió una clave de identidad desconocida.');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    decoded.signature,
    decoded.signingInput,
  );
  if (!valid) throw AppError.unauthorized('La firma de identidad de Google no es válida.');
}

async function getGoogleJwks(): Promise<GoogleJwk[]> {
  if (cachedGoogleKeys && cachedGoogleKeys.expiresAt > Date.now()) return cachedGoogleKeys.keys;

  const response = await fetch(GOOGLE_JWKS_ENDPOINT);
  if (!response.ok) throw new AppError('internal_error', 'No fue posible validar la identidad con Google.');
  const body = await response.json<{ keys?: GoogleJwk[] }>();
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new AppError('internal_error', 'Google no devolvió claves de identidad válidas.');
  }

  const maxAge = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cachedGoogleKeys = {
    keys: body.keys,
    expiresAt: Date.now() + Math.max(60, Math.min(maxAge, 86400)) * 1000,
  };
  return body.keys;
}

function assertOAuthConfiguration(env: Bindings): void {
  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.PUBLIC_API_URL ||
    !env.PUBLIC_WEB_URL
  ) {
    throw new AppError('internal_error', 'OAuth de Google aún no está configurado.');
  }
}

function googleRedirectUri(env: Bindings): string {
  return `${publicApiUrl(env)}/auth/google/callback`;
}

function publicApiUrl(env: Bindings): string {
  return env.PUBLIC_API_URL.replace(/\/+$/, '');
}

function publicWebUrl(env: Bindings): string {
  return env.PUBLIC_WEB_URL.replace(/\/+$/, '');
}

function usesSecureCookies(env: Bindings): boolean {
  return publicApiUrl(env).startsWith('https://');
}

function normalizeReturnTo(value: string | undefined): string {
  return value === '/configurar' ? value : '/configurar';
}

function stringClaim(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function deleteOAuthStateCookie(
  c: Parameters<typeof deleteCookie>[0],
  env: Bindings,
): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, {
    path: '/auth/google/callback',
    secure: usesSecureCookies(env),
  });
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
}

type GoogleJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
};
