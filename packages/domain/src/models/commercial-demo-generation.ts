import type { Id, IsoDateTime, Timestamps } from '../common';
import type { DemoBuildSpecV1 } from './commercial-demo-build';

/**
 * Server-owned recipe for the private ChatGPT creative studio.  It is derived
 * from DemoBuildSpec; it never carries contact details or commercial terms.
 */
export interface DemoGenerationManifestV1 {
  schemaVersion: 'lmwares.demo-generation-manifest.v1';
  buildSpecId: Id;
  buildSpecDigest: string;
  lifecycleId: Id;
  intakeId: Id;
  slug: string;
  profile: 'static-site-v1';
  creative: {
    businessName: string;
    businessSummary: string;
    goal: string;
    stylePreference: string | null;
    publicContext: DemoBuildSpecV1['business']['publicContext'];
    publicModules: string[];
    interactions: string[];
    exclusions: string[];
  };
  informationArchitecture: SiteRouteManifestV1;
  assetSlots: Array<{
    id: 'hero' | 'support-1' | 'support-2' | 'detail';
    purpose: string;
    aspectRatio: '16:9' | '4:5' | '1:1';
    illustrativeOnly: true;
  }>;
  limits: {
    maxImages: 4;
    maxImageRetouches: 1;
    maxCandidateReleases: 2;
  };
  output: {
    requiredPaths: ['lmwares-demo-output.json', 'source/', 'dist/index.html', 'dist/route-manifest.json', 'evidence/creative-plan.json', 'evidence/asset-manifest.json', 'evidence/checksums.json'];
    prohibitRemoteNetwork: true;
  };
  createdAt: IsoDateTime;
}

/** Framework- and hostname-independent information architecture. */
export interface SiteRouteManifestV1 {
  schemaVersion: 'lmwares.site-route-manifest.v1';
  routes: Array<{
    id: string;
    path: string;
    artifactPath: string;
    intent: string;
    title: string;
    description: string;
    /** Eligible only after a production release explicitly enables indexing. */
    productionIndexable: boolean;
  }>;
}

export interface CommercialDemoGenerationManifest extends Timestamps {
  id: Id;
  buildSpecId: Id;
  lifecycleId: Id;
  revision: number;
  schemaVersion: DemoGenerationManifestV1['schemaVersion'];
  manifest: DemoGenerationManifestV1;
  manifestDigest: string;
}

export const COMMERCIAL_DEMO_CREATIVE_RUN_STATUSES = [
  'queued', 'claimed', 'generating', 'exporting', 'validating', 'submitted', 'needs_operator', 'failed',
] as const;
export type CommercialDemoCreativeRunStatus = (typeof COMMERCIAL_DEMO_CREATIVE_RUN_STATUSES)[number];

export interface CommercialDemoCreativeRun extends Timestamps {
  id: Id;
  lifecycleId: Id;
  jobId: Id;
  generationManifestId: Id;
  executionGeneration: number;
  candidateNumber: number;
  status: CommercialDemoCreativeRunStatus;
  projectPath: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  submittedAt: IsoDateTime | null;
}

export const COMMERCIAL_DEMO_RELEASE_REVIEW_STATUSES = ['pending', 'changes_requested', 'approved', 'rejected'] as const;
export type CommercialDemoReleaseReviewStatus = (typeof COMMERCIAL_DEMO_RELEASE_REVIEW_STATUSES)[number];
export const COMMERCIAL_DEMO_RELEASE_PUBLICATION_STATUSES = ['unpublished', 'published', 'superseded', 'withdrawn'] as const;
export type CommercialDemoReleasePublicationStatus = (typeof COMMERCIAL_DEMO_RELEASE_PUBLICATION_STATUSES)[number];

export interface CommercialDemoRelease extends Timestamps {
  id: Id;
  lifecycleId: Id;
  creativeRunId: Id;
  buildSpecDigest: string;
  manifestDigest: string;
  artifactPrefix: string;
  buildDigest: string;
  assetManifestDigest: string;
  evidenceDigest: string;
  routeManifest: SiteRouteManifestV1;
  reviewStatus: CommercialDemoReleaseReviewStatus;
  publicationStatus: CommercialDemoReleasePublicationStatus;
  approvedAt: IsoDateTime | null;
  approvedBy: string | null;
}
