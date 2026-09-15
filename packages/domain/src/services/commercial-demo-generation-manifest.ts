import type { DemoBuildSpecV1 } from '../models/commercial-demo-build';
import type { DemoGenerationManifestV1 } from '../models/commercial-demo-generation';
import type { SiteRouteManifestV1 } from '../models/commercial-demo-generation';

export const DEMO_GENERATION_MANIFEST_SCHEMA_VERSION = 'lmwares.demo-generation-manifest.v1' as const;

export async function buildDemoGenerationManifest(input: {
  buildSpecId: string;
  buildSpecDigest: string;
  spec: DemoBuildSpecV1;
  slug: string;
}): Promise<{ manifest: DemoGenerationManifestV1; manifestDigest: string }> {
  if (input.spec.schemaVersion !== 'lmwares.demo-build-spec.v1' || !input.buildSpecId || !input.buildSpecDigest) {
    throw new Error('El expediente de demo no permite construir un manifiesto creativo.');
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(input.slug)) {
    throw new Error('El slug de demo es inválido.');
  }
  const manifest: DemoGenerationManifestV1 = {
    schemaVersion: DEMO_GENERATION_MANIFEST_SCHEMA_VERSION,
    buildSpecId: input.buildSpecId,
    buildSpecDigest: input.buildSpecDigest,
    lifecycleId: input.spec.lifecycleId,
    intakeId: input.spec.intakeId,
    slug: input.slug,
    profile: 'static-site-v1',
    creative: {
      businessName: input.spec.business.name,
      businessSummary: input.spec.business.summary,
      goal: input.spec.business.goal,
      stylePreference: input.spec.business.stylePreference,
      publicContext: input.spec.business.publicContext,
      publicModules: [...input.spec.allowed.publicModules],
      interactions: [...input.spec.allowed.interactions],
      exclusions: [...input.spec.allowed.exclusions],
    },
    informationArchitecture: buildSiteRouteManifest(input.spec),
    assetSlots: [
      { id: 'hero', purpose: 'Imagen principal que comunica la actividad pública del negocio.', aspectRatio: '16:9', illustrativeOnly: true },
      { id: 'support-1', purpose: 'Imagen de apoyo para el servicio o recorrido principal.', aspectRatio: '4:5', illustrativeOnly: true },
      { id: 'support-2', purpose: 'Imagen de apoyo distinta, sin fingir evidencia del negocio.', aspectRatio: '4:5', illustrativeOnly: true },
      { id: 'detail', purpose: 'Detalle visual o editorial para reforzar la composición.', aspectRatio: '1:1', illustrativeOnly: true },
    ],
    limits: { maxImages: 4, maxImageRetouches: 1, maxCandidateReleases: 2 },
    output: {
      requiredPaths: ['lmwares-demo-output.json', 'source/', 'dist/index.html', 'dist/route-manifest.json', 'evidence/creative-plan.json', 'evidence/asset-manifest.json', 'evidence/checksums.json'],
      prohibitRemoteNetwork: true,
    },
    // The build spec is immutable. Reusing its timestamp makes concurrent
    // manifest creation deterministic instead of producing competing digests.
    createdAt: input.spec.createdAt,
  };
  return { manifest, manifestDigest: await digestGenerationJson(manifest) };
}

export function buildSiteRouteManifest(spec: DemoBuildSpecV1): SiteRouteManifestV1 {
  const name = spec.business.name.trim();
  const routes: SiteRouteManifestV1['routes'] = [{
    id: 'home', path: '/', artifactPath: 'index.html', intent: 'Presentar la propuesta de valor pública del negocio.',
    title: name, description: spec.business.summary, productionIndexable: true,
  }];
  const modules = new Set(spec.allowed.publicModules.map((item) => item.toLowerCase()));
  const interactions = new Set(spec.allowed.interactions.map((item) => item.toLowerCase()));
  if ([...modules].some((item) => /catalog|store|shop|product/.test(item))) {
    routes.push({ id: 'catalog', path: '/catalogo', artifactPath: 'catalogo/index.html', intent: 'Permitir explorar la oferta o catálogo público.', title: `Catálogo | ${name}`, description: `Explora la oferta de ${name}.`, productionIndexable: true });
  }
  if ([...modules].some((item) => /portfolio|gallery|photo/.test(item))) {
    routes.push({ id: 'portfolio', path: '/portafolio', artifactPath: 'portafolio/index.html', intent: 'Mostrar trabajo visual o casos públicos con intención editorial propia.', title: `Portafolio | ${name}`, description: `Conoce el trabajo de ${name}.`, productionIndexable: true });
  }
  if ([...interactions].some((item) => /quote|contact|lead|form/.test(item))) {
    routes.push({ id: 'contact', path: '/contacto', artifactPath: 'contacto/index.html', intent: 'Explicar el siguiente paso de contacto sin enviar datos en la demo.', title: `Contacto | ${name}`, description: `Conoce cómo iniciar una conversación con ${name}.`, productionIndexable: false });
  }
  validateSiteRouteManifest({ schemaVersion: 'lmwares.site-route-manifest.v1', routes });
  return { schemaVersion: 'lmwares.site-route-manifest.v1', routes };
}

export function validateSiteRouteManifest(manifest: SiteRouteManifestV1): void {
  if (manifest.schemaVersion !== 'lmwares.site-route-manifest.v1' || manifest.routes.length === 0) throw new Error('El manifiesto de rutas es inválido.');
  const seenPaths = new Set<string>(); const seenIntents = new Set<string>();
  for (const route of manifest.routes) {
    if (!/^[a-z][a-z0-9-]{0,48}$/.test(route.id) || !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(route.path)) throw new Error('La ruta de demo no es canónica.');
    if (!/^(?:[a-z0-9-]+\/)*index\.html$/.test(route.artifactPath) || route.artifactPath.includes('..')) throw new Error('El artefacto de ruta es inválido.');
    const path = route.path === '/' ? '/' : route.path.replace(/\/$/, '');
    const intent = route.intent.trim().toLocaleLowerCase();
    if (seenPaths.has(path) || seenIntents.has(intent) || route.title.trim().length < 2 || route.description.trim().length < 12) throw new Error('Las rutas requieren paths, intención y contenido propios.');
    seenPaths.add(path); seenIntents.add(intent);
  }
  if (!seenPaths.has('/')) throw new Error('El manifiesto necesita una ruta principal.');
}

async function digestGenerationJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableGenerationJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableGenerationJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableGenerationJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableGenerationJson(record[key])}`).join(',')}}`;
}
