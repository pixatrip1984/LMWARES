import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

/**
 * Immutable, server-authored input for a Phase 0 frontend build. It carries
 * public business context only; personal contacts and commercial amounts stay
 * in the commercial record.
 */
export interface DemoBuildSpecV1 {
  schemaVersion: 'lmwares.demo-build-spec.v1';
  lifecycleId: Id;
  intakeId: Id;
  acceptedOffer: {
    id: Id;
    version: number;
    acceptedAt: IsoDateTime;
    digest: string;
    plan: string;
    modules: string[];
    scopeSummary: string;
    implementationDescription: string;
  };
  business: {
    name: string;
    summary: string;
    goal: string;
    stylePreference: string | null;
    /** Server-filtered public diagnosis; never contains contacts or pricing. */
    publicContext: {
      model: string;
      industry: string;
      offerTypes: string[];
      websiteNeeds: string[];
      visualPreferences: string[];
      contentAssets: string[];
    } | null;
  };
  demoBrief: {
    headline: string;
    subheadline: string;
    sections: string[];
  } | null;
  allowed: {
    publicModules: string[];
    interactions: string[];
    exclusions: string[];
  };
  source: {
    starterCommit: string;
    projectPath: string | null;
  };
  createdAt: IsoDateTime;
}

export interface CommercialDemoBuildSpec extends Timestamps {
  id: Id;
  lifecycleId: Id;
  intakeId: Id;
  acceptedOfferId: Id;
  revision: number;
  schemaVersion: DemoBuildSpecV1['schemaVersion'];
  spec: DemoBuildSpecV1;
  specDigest: string;
}

export interface CommercialDemoDesignPlan extends Timestamps {
  id: Id;
  buildSpecId: Id;
  revision: number;
  status: 'draft' | 'selected' | 'superseded';
  plan: Metadata;
  digest: string;
}
