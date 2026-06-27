/** Estados del ciclo de vida de una publicación. */
export const PUBLICATION_STATUSES = ['draft', 'published', 'archived'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/**
 * Estados genéricos de una solicitud (pipeline base reutilizable).
 * Cada proyecto puede mapear estos a su propia terminología vía config.
 */
export const REQUEST_STATUSES = [
  'new',
  'in_review',
  'approved',
  'rejected',
  'closed',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Tipo de entidad sobre la que se registra historial/auditoría. */
export const ENTITY_TYPES = ['publication', 'request'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
