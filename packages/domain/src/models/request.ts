import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';
import type { RequestStatus } from './status';

/**
 * Solicitud entrante desde el frontend público: contacto, cotización,
 * registro, lead, etc. `type` y `payload` permiten especializar por proyecto.
 */
export interface Request extends Timestamps {
  id: Id;
  /** Discriminador configurable, p.ej. "contact" | "quote" | "signup". */
  type: string;
  status: RequestStatus;
  /** Publicación relacionada, si la solicitud parte de un item. */
  publicationId: Id | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  message: string | null;
  /** Campos extra del formulario, específicos del proyecto. */
  payload: Metadata;
  /** Origen, p.ej. "public-web", "landing-x". */
  source: string | null;
}

/** Nota interna agregada por un admin a una solicitud. */
export interface RequestNote {
  id: Id;
  requestId: Id;
  /** Email del AdminUser autor. */
  authorEmail: string;
  body: string;
  createdAt: IsoDateTime;
}
