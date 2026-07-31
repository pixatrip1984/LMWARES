import type { ComponentType } from 'react';
import { BlogPublicModule } from './blog/BlogPublicModule';
import { DocsPublicModule } from './docs/DocsPublicModule';
import { EventsPublicModule } from './events/EventsPublicModule';
import { FormPublicModule } from './forms/FormPublicModule';
import { GalleriesPublicModule } from './galleries/GalleriesPublicModule';

export const SITE_MODULE_KEYS = [
  'blog',
  'galleries',
  'docs',
  'forms',
  'events',
] as const;

export type SiteModuleKey = (typeof SITE_MODULE_KEYS)[number];

interface PublicModuleProps {
  projectId: string;
  apiBaseUrl?: string;
}

const SITE_MODULE_REGISTRY: Record<SiteModuleKey, ComponentType<PublicModuleProps>> = {
  blog: BlogPublicModule,
  galleries: GalleriesPublicModule,
  docs: DocsPublicModule,
  forms: FormPublicModule,
  events: EventsPublicModule,
};

export interface SiteModuleComposerProps extends PublicModuleProps {
  modules: readonly SiteModuleKey[];
}

export function SiteModuleComposer({
  projectId,
  apiBaseUrl,
  modules,
}: SiteModuleComposerProps) {
  const enabledModules = normalizeSiteModules(modules);

  return (
    <div data-site-module-composer="">
      {enabledModules.map((moduleKey) => {
        const PublicModule = SITE_MODULE_REGISTRY[moduleKey];
        return (
          <section data-site-module={moduleKey} id={`module-${moduleKey}`} key={moduleKey}>
            <PublicModule projectId={projectId} apiBaseUrl={apiBaseUrl} />
          </section>
        );
      })}
    </div>
  );
}

export function parseSiteModules(value: string | null): SiteModuleKey[] {
  if (!value) return [];
  return normalizeSiteModules(value.split(','));
}

function normalizeSiteModules(modules: readonly string[]): SiteModuleKey[] {
  const seen = new Set<SiteModuleKey>();
  const normalized: SiteModuleKey[] = [];

  for (const moduleKey of modules) {
    if (!isSiteModuleKey(moduleKey) || seen.has(moduleKey)) continue;
    seen.add(moduleKey);
    normalized.push(moduleKey);
  }

  return normalized;
}

function isSiteModuleKey(value: string): value is SiteModuleKey {
  return SITE_MODULE_KEYS.some((moduleKey) => moduleKey === value);
}
