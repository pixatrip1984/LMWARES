import type { Context, MiddlewareHandler, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError, type AdminRole } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Identity, Variables } from '../env';
import { verifyAccessJwt } from '../lib/access';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

const WRITE_ROLES: AdminRole[] = ['owner', 'admin', 'editor'];
const APPROVAL_ROLES: AdminRole[] = ['owner', 'admin'];

/**
 * Middleware de identidad: valida el JWT de Cloudflare Access y sincroniza el
 * AdminUser. En local (ACCESS_DISABLED="1") confía en el header X-Dev-Email.
 */
export function accessMiddleware(): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> {
  return async (c, next) => {
    const identity = await resolveAccessIdentity(c);

    if (!isAllowlistedAdmin(identity.email, c.env.ADMIN_EMAIL_ALLOWLIST)) {
      throw AppError.forbidden('Tu identidad de Access no está autorizada para el panel.');
    }

    const repos = createRepositories(c.env.DB);
    const admin = await repos.adminUsers.syncFromAccess(
      identity.email,
      identity.name,
      c.env.AUTO_PROVISION_ADMINS === '1',
    );
    if (!admin || !admin.active) {
      throw AppError.forbidden('Tu usuario no está autorizado para el panel.');
    }

    c.set('identity', identity);
    c.set('admin', admin);
    await next();
  };
}

/**
 * Autoriza únicamente a un vendedor ya aprovisionado. No crea vendedores al
 * iniciar sesión: la alta sigue siendo una decisión explícita de administración.
 */
export function salesAccessMiddleware(): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> {
  return async (c, next) => {
    const identity = await resolveAccessIdentity(c);
    const repos = createRepositories(c.env.DB);
    const seller = await repos.lmwaresCommercialOperations.getSalesActorForAccess({
      email: identity.email,
      accessSubject: identity.accessSubject,
    });
    if (!seller || seller.status !== 'active') {
      throw AppError.forbidden('Tu identidad no está autorizada para Sales.');
    }
    c.set('identity', identity);
    c.set('salesActor', seller);
    await next();
  };
}

async function resolveAccessIdentity(c: Ctx): Promise<Identity> {
  if (c.env.ACCESS_DISABLED === '1') {
    const devEmail = c.req.header('X-Dev-Email') ?? 'admin@example.com';
    return { email: devEmail, name: 'Dev Admin', accessSubject: null };
  }
  const token = c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization');
  if (!token) throw AppError.unauthorized('Falta el token de Cloudflare Access.');
  const claims = await verifyAccessJwt(token, c.env.ACCESS_TEAM_DOMAIN, c.env.ACCESS_AUD);
  if (!claims.email) throw AppError.unauthorized('El token no contiene email.');
  return { email: claims.email, name: claims.name ?? null, accessSubject: claims.sub ?? null };
}

function isAllowlistedAdmin(email: string, rawAllowlist: string | undefined): boolean {
  const allowlist = (rawAllowlist ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

/** Exige rol con permisos de escritura. Úsalo en endpoints mutantes. */
export async function requireWrite(c: Ctx, next: Next) {
  const admin = c.get('admin');
  if (!WRITE_ROLES.includes(admin.role)) {
    throw AppError.forbidden('Tu rol no permite esta acción.');
  }
  await next();
}

/** Exige una identidad capaz de decidir gates humanos. Los editores solo aportan evidencia. */
export async function requireApproval(c: Ctx, next: Next) {
  const admin = c.get('admin');
  if (!APPROVAL_ROLES.includes(admin.role)) {
    throw AppError.forbidden('Tu rol no permite aprobar gates del proyecto.');
  }
  await next();
}
