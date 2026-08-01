/** Estados del ciclo de vida de una publicación. */
export const PUBLICATION_STATUSES = ['draft', 'published', 'archived'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/**
 * Estados genéricos de una solicitud (pipeline base reutilizable).
 * Cada proyecto puede mapear estos a su propia terminología vía config.
 */
export const REQUEST_STATUSES = ['new', 'in_review', 'approved', 'rejected', 'closed'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Tipo de entidad sobre la que se registra historial/auditoría. */
export const ENTITY_TYPES = [
  'publication',
  'request',
  'lmwares_project',
  'lmwares_snapshot',
  'lmwares_validation',
  'lmwares_approval',
  'lmwares_free_intake',
  'lmwares_free_job',
  'lmwares_free_asset',
  'lmwares_package_intake',
  'lmwares_commercial_offer',
  'lmwares_package_proposal',
  'lmwares_subscription',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
