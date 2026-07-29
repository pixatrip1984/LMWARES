import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import { parseList } from '@starter/config';
import type { Bindings, Variables } from '../env';
import { sha256Hex } from '../lib/auth-crypto';

type PublicContext = Context<{ Bindings: Bindings; Variables: Variables }>;

export const PUBLIC_SESSION_COOKIE = 'lmw_session';

export async function loadPublicSession(c: PublicContext) {
  const token = getCookie(c, PUBLIC_SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  return createRepositories(c.env.DB).lmwaresAuth.getActiveSessionByTokenHash(tokenHash);
}

export async function requirePublicSession(c: PublicContext) {
  const session = await loadPublicSession(c);
  if (!session) throw AppError.unauthorized('Inicia sesión para continuar.');

  c.set('publicUser', session.user);
  c.set('publicSessionId', session.id);
  c.set('publicSessionExpiresAt', session.expiresAt);
  return session;
}

export function assertIntakeOwner(
  intake: { userId: string | null },
  userId: string,
): void {
  // Deliberadamente responde 404 para no revelar solicitudes ajenas.
  if (!intake.userId || intake.userId !== userId) throw AppError.notFound('Solicitud Free');
}

/** Bloquea CSRF desde otros orígenes, incluidos subdominios Free vecinos. */
export function assertTrustedPublicOrigin(c: PublicContext): void {
  const origin = c.req.header('Origin');
  const allowedOrigins = parseList(c.env.ALLOWED_ORIGINS);
  if (!origin || !allowedOrigins.includes(origin)) {
    throw AppError.forbidden('Origen de solicitud no permitido.');
  }
}
