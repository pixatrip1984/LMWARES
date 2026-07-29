import type { Id, IsoDateTime, Timestamps } from '../common';

/** Cuenta pública de un cliente de LMWares, independiente del proveedor OAuth. */
export interface PublicUser extends Timestamps {
  id: Id;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}

/** Sesión pública devuelta al frontend; nunca contiene el token de sesión. */
export interface PublicAuthSession {
  authenticated: boolean;
  user: PublicUser | null;
  expiresAt: IsoDateTime | null;
}
