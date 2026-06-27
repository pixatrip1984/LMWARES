import type { D1Database } from '@cloudflare/workers-types';
import { AdminUsersRepository } from './repositories/admin-users';
import { AuditRepository, StatusHistoryRepository } from './repositories/audit';
import { FileAssetsRepository } from './repositories/file-assets';
import { PublicationsRepository } from './repositories/publications';
import { RequestsRepository } from './repositories/requests';

export * from './helpers';
export * from './repositories/publications';
export * from './repositories/requests';
export * from './repositories/file-assets';
export * from './repositories/audit';
export * from './repositories/admin-users';

/** Conjunto de repositorios construidos sobre una instancia de D1. */
export interface Repositories {
  publications: PublicationsRepository;
  requests: RequestsRepository;
  fileAssets: FileAssetsRepository;
  statusHistory: StatusHistoryRepository;
  audit: AuditRepository;
  adminUsers: AdminUsersRepository;
}

/**
 * Punto de entrada único del paquete db. Los Workers llaman a esto con su
 * binding `env.DB` y obtienen todos los repositorios tipados.
 */
export function createRepositories(db: D1Database): Repositories {
  return {
    publications: new PublicationsRepository(db),
    requests: new RequestsRepository(db),
    fileAssets: new FileAssetsRepository(db),
    statusHistory: new StatusHistoryRepository(db),
    audit: new AuditRepository(db),
    adminUsers: new AdminUsersRepository(db),
  };
}
