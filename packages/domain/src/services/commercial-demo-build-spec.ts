import type { CommercialOffer } from '../models/commercial-offer';
import type { DemoBuildSpecV1 } from '../models/commercial-demo-build';
import type { PackageIntake } from '../models/package-intake';

export const DEMO_BUILD_SPEC_SCHEMA_VERSION = 'lmwares.demo-build-spec.v1' as const;

const PRIVATE_CONTEXT_KEYS = new Set([
  'contactName', 'contactPhone', 'customDomainPreference', 'referenceNotes',
  'email', 'phone', 'price', 'amount', 'discount', 'termsSnapshot',
]);

export type BuildDemoBuildSpecInput = {
  lifecycleId: string;
  intake: PackageIntake;
  acceptedOffer: CommercialOffer;
  scopeResult?: unknown;
  starterCommit: string;
  projectPath?: string | null;
  createdAt: string;
};

export async function buildDemoBuildSpec(input: BuildDemoBuildSpecInput): Promise<{ spec: DemoBuildSpecV1; specDigest: string }> {
  const { acceptedOffer, intake } = input;
  if (acceptedOffer.status !== 'accepted' || !acceptedOffer.acceptedAt) {
    throw new Error('La demo requiere una oferta aceptada.');
  }
  if (acceptedOffer.intakeId !== intake.id) {
    throw new Error('La oferta aceptada no pertenece a esta solicitud.');
  }
  const offerDigest = await digestJson({
    id: acceptedOffer.id,
    version: acceptedOffer.version,
    acceptedAt: acceptedOffer.acceptedAt,
    plan: acceptedOffer.plan,
    modules: acceptedOffer.modules,
    scopeSummary: acceptedOffer.scopeSummary,
    implementationDescription: acceptedOffer.implementationDescription,
    termsVersion: acceptedOffer.termsVersion,
  });
  const demoBrief = readDemoBrief(input.scopeResult, acceptedOffer.id);
  const publicContext = readPublicBusinessContext(intake.packageSnapshot);
  const publicModules = [...new Set(acceptedOffer.modules)].sort();
  const spec: DemoBuildSpecV1 = {
    schemaVersion: DEMO_BUILD_SPEC_SCHEMA_VERSION,
    lifecycleId: input.lifecycleId,
    intakeId: intake.id,
    acceptedOffer: {
      id: acceptedOffer.id,
      version: acceptedOffer.version,
      acceptedAt: acceptedOffer.acceptedAt,
      digest: offerDigest,
      plan: acceptedOffer.plan,
      modules: publicModules,
      scopeSummary: normalizeText(acceptedOffer.scopeSummary, 2000),
      implementationDescription: normalizeText(acceptedOffer.implementationDescription, 4000),
    },
    business: {
      name: normalizeText(intake.brief.businessName, 160),
      summary: normalizeText(intake.brief.businessSummary, 2400),
      goal: normalizeText(intake.brief.siteGoal, 1200),
      stylePreference: intake.brief.stylePreference ? normalizeText(intake.brief.stylePreference, 500) : null,
      publicContext,
    },
    demoBrief,
    allowed: {
      publicModules,
      interactions: allowedInteractions(publicModules),
      exclusions: [
        'No pagos, checkout, autenticación, panel privado, envíos reales ni almacenamiento de datos.',
        'No precios, testimonios, credenciales, disponibilidad, personas o recursos visuales inventados.',
        'No scripts remotos, formularios funcionales, analítica ni conexiones externas sin autorización explícita.',
      ],
    },
    source: { starterCommit: normalizeCommit(input.starterCommit), projectPath: input.projectPath ?? null },
    createdAt: input.createdAt,
  };
  assertNoPrivateContext(spec);
  return { spec, specDigest: await digestJson(spec) };
}

export async function digestJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  // Some consumers of @starter/domain intentionally compile without DOM/Web
  // Crypto types, while both Workers and Node 20 provide it at runtime.
  const runtimeCrypto = (globalThis as unknown as {
    crypto?: { subtle?: { digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer> } };
  }).crypto;
  if (!runtimeCrypto?.subtle) throw new Error('Este entorno no dispone de SHA-256 para el expediente de demo.');
  const hash = await runtimeCrypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function readDemoBrief(scopeResult: unknown, offerId: string): DemoBuildSpecV1['demoBrief'] {
  if (!scopeResult || typeof scopeResult !== 'object') return null;
  const result = scopeResult as Record<string, unknown>;
  if (result.offerId !== offerId || !result.demoBrief || typeof result.demoBrief !== 'object') return null;
  const brief = result.demoBrief as Record<string, unknown>;
  const sections = Array.isArray(brief.sections)
    ? brief.sections.filter((value): value is string => typeof value === 'string').map((value) => normalizeText(value, 120)).filter(Boolean).slice(0, 6)
    : [];
  const headline = typeof brief.headline === 'string' ? normalizeText(brief.headline, 160) : '';
  const subheadline = typeof brief.subheadline === 'string' ? normalizeText(brief.subheadline, 360) : '';
  return headline && subheadline && sections.length >= 3 ? { headline, subheadline, sections } : null;
}

function readPublicBusinessContext(snapshot: unknown): DemoBuildSpecV1['business']['publicContext'] {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const interview = (snapshot as Record<string, unknown>).businessInterview;
  if (!interview || typeof interview !== 'object') return null;
  const profile = (interview as Record<string, unknown>).profile;
  if (!profile || typeof profile !== 'object') return null;
  const record = profile as Record<string, unknown>;
  const business = record.business as Record<string, unknown> | undefined;
  const requirements = record.requirements as Record<string, unknown> | undefined;
  const list = (value: unknown, limit: number) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => normalizeText(item, 80)).filter(Boolean).slice(0, limit)
    : [];
  const text = (value: unknown) => typeof value === 'string' ? normalizeText(value, 80) : '';
  const model = text(business?.model); const industry = text(business?.industry);
  if (!model && !industry) return null;
  return {
    model,
    industry,
    offerTypes: list(business?.offerTypes, 8),
    websiteNeeds: list(requirements?.publicWebsite, 12),
    visualPreferences: list(record.visualPreferences, 6),
    contentAssets: list(record.contentAssets, 8),
  };
}

function allowedInteractions(modules: string[]): string[] {
  const interactions = ['Navegación por secciones, menú móvil, acordeones y detalles informativos locales.'];
  if (modules.some((module) => /catalog|store|product|shop/i.test(module))) interactions.push('Filtros, búsqueda y detalle sobre datos de demostración en memoria.');
  if (modules.some((module) => /gallery|portfolio|photo/i.test(module))) interactions.push('Galería y lightbox accesibles con recursos autorizados.');
  if (modules.some((module) => /quote|form|lead|contact/i.test(module))) interactions.push('Formulario de ejemplo con validación local y aviso de que no se envía información.');
  return interactions;
}

function normalizeText(value: string, max: number): string { return value.replace(/\s+/g, ' ').trim().slice(0, max); }
function normalizeCommit(value: string): string { return /^[a-f0-9]{7,64}$/i.test(value) ? value.toLowerCase() : 'unresolved'; }
function assertNoPrivateContext(spec: DemoBuildSpecV1): void {
  const serialized = stableJson(spec).toLowerCase();
  for (const key of PRIVATE_CONTEXT_KEYS) if (serialized.includes(`\"${key.toLowerCase()}\"`)) throw new Error('El expediente de demo contiene contexto privado no permitido.');
}
