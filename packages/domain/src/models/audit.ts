import type { Id, IsoDateTime, Metadata } from '../common';
import type { EntityType } from './status';

/** Quién origina un evento de auditoría. */
export const ACTOR_TYPES = ['admin', 'system', 'public'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/**
 * Registro inmutable del cambio de estado de una entidad.
 * Permite reconstruir el ciclo de vida de publicaciones y solicitudes.
 */
export interface StatusHistory {
  id: Id;
  entityType: EntityType;
  entityId: Id;
  fromStatus: string | null;
  toStatus: string;
  /** Email del admin que cambió el estado, o null si fue el sistema. */
  changedBy: string | null;
  reason: string | null;
  createdAt: IsoDateTime;
}

/** Evento de auditoría genérico (append-only). */
export interface AuditEvent {
  id: Id;
  actorType: ActorType;
  /** Email del admin o identificador del actor; null si anónimo. */
  actorId: string | null;
  /** Acción en formato verbo.recurso, p.ej. "publication.create". */
  action: string;
  entityType: EntityType | null;
  entityId: Id | null;
  metadata: Metadata;
  ip: string | null;
  userAgent: string | null;
  createdAt: IsoDateTime;
}
