/**
 * Deterministic commercial diagnosis captured before a paid intake is sent.
 * It separates client selections from derived conclusions. Personal contacts
 * stay in PackageIntakeBrief and never enter this artifact.
 */
export type BusinessInterviewAnswer = string | string[] | boolean;

export type BusinessInterviewInference = {
  key: string;
  value: BusinessInterviewAnswer;
  confidence: 'high' | 'medium';
  basedOn: string[];
};

export type BusinessProfileV1 = {
  schemaVersion: 'lmwares.business-profile.v1';
  explicitAnswers: Record<string, BusinessInterviewAnswer>;
  inferences: BusinessInterviewInference[];
  business: { model: string; industry: string; offerTypes: string[] };
  salesFlow: { leadSources: string[]; startsWith: string; channels: string[] };
  operations: {
    teamSize: string;
    needsInventory: boolean | null;
    needsAppointments: boolean | null;
    needsProjectTracking: boolean | null;
    needsCustomerRecords: boolean | null;
    needsFollowUp: boolean | null;
    needsTeamAccess: boolean | null;
    needsRolePermissions: boolean | null;
  };
  entities: string[];
  requirements: { publicWebsite: string[]; internalSystem: string[]; suggestedModules: string[] };
  contentAssets: string[];
  visualPreferences: string[];
  confidence: { completeness: number; unresolved: string[] };
};

export type BusinessInterviewSubmissionV1 = {
  schemaVersion: 'lmwares.business-interview-submission.v1';
  profile: BusinessProfileV1;
  completedAt: string;
};
