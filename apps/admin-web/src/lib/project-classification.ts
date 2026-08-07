import type { LmwaresProject } from '@starter/domain';

/**
 * Tag applied by `scripts/scan-dev-projects.mjs` (`isCloudflareStarterLike`
 * signal) to any sibling repo under the scanned dev root that looks like a
 * Cloudflare Starter deployment (apps/workers/packages layout with a
 * `validate:local` script). It is the most reliable, machine-set signal that
 * a registry entry is an actual client Starter site rather than one of
 * Oracle's own internal tooling repos.
 */
export const CLIENT_STARTER_TAG = 'cloudflare-starter';

/**
 * Category label the same scan script infers for that signal
 * (`inferCategory` in scan-dev-projects.mjs). A project manifest can override
 * `category` freely, so this is treated as a secondary signal alongside the
 * tag above rather than the sole source of truth.
 */
export const CLIENT_STARTER_CATEGORY = 'Cliente LMwares';

/**
 * A `LmwaresProject` registry entry can represent either one of Oracle's own
 * internal projects (this repo, tooling, unrelated experiments) or an actual
 * Starter site being built/operated for a paying client. The two must stay
 * distinguishable in the admin UI: client-site operational actions (managing
 * blog/gallery/docs/forms/events content via `/projects/:id/modules/*`) only
 * make sense for the latter, and applying them to an internal project would
 * be an unsafe/ambiguous action (writing content nobody will ever see).
 */
export function isClientStarterProject(
  project: Pick<LmwaresProject, 'category' | 'tags'>,
): boolean {
  return (
    project.category === CLIENT_STARTER_CATEGORY || project.tags.includes(CLIENT_STARTER_TAG)
  );
}
