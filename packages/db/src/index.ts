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
import { LmwaresFreeIntakesRepository } from './repositories/lmwares-free-intakes';
import { LmwaresAuthRepository } from './repositories/lmwares-auth';
import { LmwaresNotificationsRepository } from './repositories/lmwares-notifications';
import { LmwaresPaymentsRepository } from './repositories/lmwares-payments';
import { LmwaresPackageIntakesRepository } from './repositories/lmwares-package-intakes';
import { LmwaresCommercialOffersRepository } from './repositories/lmwares-commercial-offers';
import { LmwaresSubscriptionsRepository } from './repositories/lmwares-subscriptions';
import { SiteBlogRepository } from './repositories/site-blog';
import { SiteGalleryRepository } from './repositories/site-gallery';
import { SiteDocsRepository } from './repositories/site-docs';
import { SiteFormsRepository } from './repositories/site-forms';
import { SiteEventsRepository } from './repositories/site-events';

export * from './helpers';
export * from './repositories/publications';
export * from './repositories/requests';
export * from './repositories/file-assets';
export * from './repositories/audit';
export * from './repositories/admin-users';
export * from './repositories/lmwares-projects';
export * from './repositories/lmwares-evidence';
export * from './repositories/lmwares-free-intakes';
export * from './repositories/lmwares-auth';
export * from './repositories/lmwares-notifications';
export * from './repositories/lmwares-payments';
export * from './repositories/lmwares-package-intakes';
export * from './repositories/lmwares-commercial-offers';
export * from './repositories/lmwares-subscriptions';
export * from './repositories/site-blog';
export * from './repositories/site-gallery';
export * from './repositories/site-docs';
export * from './repositories/site-forms';
export * from './repositories/site-events';

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
  lmwaresFreeIntakes: LmwaresFreeIntakesRepository;
  lmwaresAuth: LmwaresAuthRepository;
  lmwaresNotifications: LmwaresNotificationsRepository;
  lmwaresPayments: LmwaresPaymentsRepository;
  lmwaresPackageIntakes: LmwaresPackageIntakesRepository;
  lmwaresCommercialOffers: LmwaresCommercialOffersRepository;
  lmwaresSubscriptions: LmwaresSubscriptionsRepository;
  siteBlog: SiteBlogRepository;
  siteGalleries: SiteGalleryRepository;
  siteDocs: SiteDocsRepository;
  siteForms: SiteFormsRepository;
  siteEvents: SiteEventsRepository;
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
    lmwaresFreeIntakes: new LmwaresFreeIntakesRepository(db),
    lmwaresAuth: new LmwaresAuthRepository(db),
    lmwaresNotifications: new LmwaresNotificationsRepository(db),
    lmwaresPayments: new LmwaresPaymentsRepository(db),
    lmwaresPackageIntakes: new LmwaresPackageIntakesRepository(db),
    lmwaresCommercialOffers: new LmwaresCommercialOffersRepository(db),
    lmwaresSubscriptions: new LmwaresSubscriptionsRepository(db),
    siteBlog: new SiteBlogRepository(db),
    siteGalleries: new SiteGalleryRepository(db),
    siteDocs: new SiteDocsRepository(db),
    siteForms: new SiteFormsRepository(db),
    siteEvents: new SiteEventsRepository(db),
  };
}
