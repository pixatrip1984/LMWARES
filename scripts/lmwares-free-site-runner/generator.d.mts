import type {
  FileAsset,
  FreeContactMethod,
  FreeGenerationJob,
  FreeIntake,
  FreeIntakeAsset,
} from '@starter/domain';

export interface GeneratedFreeAsset {
  asset: FreeIntakeAsset;
  fileAsset: FileAsset;
  mediaPath: string;
}

export interface FreeSiteGeneratorInput {
  job: FreeGenerationJob;
  intake: FreeIntake;
  contacts: FreeContactMethod[];
  assets: GeneratedFreeAsset[];
}

export const FREE_SITE_RESPONSIVE_STYLE_ID: string;
export const FREE_SITE_RESPONSIVE_CSS: string;

export function buildManifest(input: FreeSiteGeneratorInput): Record<string, unknown>;

export function renderSite(
  input: Omit<FreeSiteGeneratorInput, 'job'> & {
    manifest: Record<string, unknown>;
    apiUrl: string;
  },
): string;
