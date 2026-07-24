import type { D1Database } from '@cloudflare/workers-types';
import { AdminUsersRepository } from './repositories/admin-users';
import { AuditRepository, StatusHistoryRepository } from './repositories/audit';
import { FileAssetsRepository } from './repositories/file-assets';
import { PublicationsRepository } from './repositories/publications';
import { RequestsRepository } from './repositories/requests';
import {
  LmwaresProjectsRepository,
  LmwaresProjectSnapshotsRepository,
} from './repositories/lmwares-projects';
import {
  LmwaresApprovalsRepository,
  LmwaresValidationResultsRepository,
} from './repositories/lmwares-evidence';

export * from './helpers';
export * from './repositories/publications';
export * from './repositories/requests';
export * from './repositories/file-assets';
export * from './repositories/audit';
export * from './repositories/admin-users';
export * from './repositories/lmwares-projects';
export * from './repositories/lmwares-evidence';

/** Conjunto de repositorios construidos sobre una instancia de D1. */
export interface Repositories {
  publications: PublicationsRepository;
  requests: RequestsRepository;
  fileAssets: FileAssetsRepository;
  statusHistory: StatusHistoryRepository;
  audit: AuditRepository;
  adminUsers: AdminUsersRepository;
  lmwaresProjects: LmwaresProjectsRepository;
  lmwaresProjectSnapshots: LmwaresProjectSnapshotsRepository;
  lmwaresValidationResults: LmwaresValidationResultsRepository;
  lmwaresApprovals: LmwaresApprovalsRepository;
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
    lmwaresProjects: new LmwaresProjectsRepository(db),
    lmwaresProjectSnapshots: new LmwaresProjectSnapshotsRepository(db),
    lmwaresValidationResults: new LmwaresValidationResultsRepository(db),
    lmwaresApprovals: new LmwaresApprovalsRepository(db),
  };
}
