import type { Context, MiddlewareHandler, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError, type AdminRole } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Identity, Variables } from '../env';
import { verifyAccessJwt } from '../lib/access';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

const WRITE_ROLES: AdminRole[] = ['owner', 'admin', 'editor'];

/**
 * Middleware de identidad: valida el JWT de Cloudflare Access y sincroniza el
 * AdminUser. En local (ACCESS_DISABLED="1") confía en el header X-Dev-Email.
 */
export function accessMiddleware(): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> {
  return async (c, next) => {
    let identity: Identity;

    if (c.env.ACCESS_DISABLED === '1') {
      const devEmail = c.req.header('X-Dev-Email') ?? 'admin@example.com';
      identity = { email: devEmail, name: 'Dev Admin' };
    } else {
      const token =
        c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization');
      if (!token) throw AppError.unauthorized('Falta el token de Cloudflare Access.');
      const claims = await verifyAccessJwt(token, c.env.ACCESS_TEAM_DOMAIN, c.env.ACCESS_AUD);
      if (!claims.email) throw AppError.unauthorized('El token no contiene email.');
      identity = { email: claims.email, name: claims.name ?? null };
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

/** Exige rol con permisos de escritura. Úsalo en endpoints mutantes. */
export async function requireWrite(c: Ctx, next: Next) {
  const admin = c.get('admin');
  if (!WRITE_ROLES.includes(admin.role)) {
    throw AppError.forbidden('Tu rol no permite esta acción.');
  }
  await next();
}
