import { AppError, normalizeCommercialMarketing, normalizePaidPackageModules, type PackageIntake, type PaidPackageModuleId } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings } from '../env';
import { notifyOperator } from './operational-alerts';

const RUNNER_ID = 'deepseek-v4-flash:scope';
const MODEL = 'deepseek-v4-flash';
const TERMS_VERSION = 'lmwares-commercial-terms-2026-07-v1';
const CAPABILITIES: Record<PaidPackageModuleId, string> = {
  landing: 'Página pública de presentación, secciones y contacto.', panel: 'Panel privado base para la operación acordada.',
  blog: 'Sección editorial administrable.', galleries: 'Galerías de imágenes administrables.',
  catalog: 'Catálogo informativo de productos o servicios, sin ventas en línea.', quote: 'Formulario para solicitar cotización.',
  events: 'Listado de eventos administrables.', docs: 'Biblioteca privada de documentos con descargas controladas.',
  cart: 'No disponible.', data: 'No disponible.',
};
type ScopeDraft = { scopeSummary: string; implementationDescription: string; recurringDescription: string; demoBrief: { headline: string; subheadline: string; sections: string[] } };

export async function enqueueAutomaticScope(env: Bindings, intakeId: string): Promise<void> {
  const job = await createRepositories(env.DB).lmwaresCommercialAgentJobs.enqueue({ intakeId, jobType: 'scope' });
  await processScopeJob(env, job.id);
}

export async function processScopeJob(env: Bindings, jobId: string): Promise<void> {
  const repos = createRepositories(env.DB);
  const job = await repos.lmwaresCommercialAgentJobs.claimById(jobId, RUNNER_ID, 90_000);
  if (!job) return;
  await processClaimedScopeJob(env, job);
}

export async function processQueuedScopeJob(env: Bindings): Promise<void> {
  const job = await createRepositories(env.DB).lmwaresCommercialAgentJobs.claimNext('scope', RUNNER_ID, 90_000);
  if (!job) return;
  await processClaimedScopeJob(env, job);
}

async function processClaimedScopeJob(env: Bindings, job: { id: string; intakeId: string; leaseToken: string | null }): Promise<void> {
  const repos = createRepositories(env.DB);
  try {
    const intake = await repos.lmwaresPackageIntakes.getById(job.intakeId);
    if (!intake) throw AppError.notFound('Solicitud comercial');
    if (intake.status === 'submitted') await repos.lmwaresPackageIntakes.review({ id: intake.id, status: 'scope_review', reviewedBy: RUNNER_ID, notes: 'Alcance inicial generado automáticamente con DeepSeek Flash.' });
    const fresh = await repos.lmwaresPackageIntakes.getById(intake.id);
    if (!fresh || !['scope_review', 'offer_ready'].includes(fresh.status)) throw new AppError('conflict', 'La solicitud ya no admite una propuesta automática.');
    const existingOffers = await repos.lmwaresCommercialOffers.listForIntake(fresh.id);
    const existingOffer = existingOffers[0];
    if (existingOffer) {
      // Recovery after issue/complete interruption must not replace a presented
      // or accepted offer, including one prepared manually by an administrator.
      await repos.lmwaresCommercialAgentJobs.complete({ id: job.id, runnerId: RUNNER_ID, leaseToken: job.leaseToken!, result: { offerId: existingOffer.id, recovered: true } });
      return;
    }
    const draft = await draftScope(env, fresh);
    const offer = await repos.lmwaresCommercialOffers.issue({
      intakeId: fresh.id, plan: fresh.plan, modules: normalizePaidPackageModules(fresh.plan, fresh.modules), marketing: normalizeCommercialMarketing(fresh.marketing),
      implementationAmountCents: fresh.estimatedImplementationCents, monthlyAmountCents: fresh.estimatedMonthlyCents,
      scopeSummary: draft.scopeSummary, implementationDescription: draft.implementationDescription, recurringDescription: draft.recurringDescription,
      termsVersion: TERMS_VERSION,
      termsSnapshot: { schema: 'lmwares.commercial-terms.v1', generatedWith: MODEL, maintenanceStartPolicy: 'on_go_live', implementationPayment: 'La fase 0 es una demo gratuita. El primer pago se habilita después de aprobar la demo.', initialHosting: 'La demo inicia en un subdominio LMWares.', support: 'soporte@lmwares.com' },
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(), issuedBy: RUNNER_ID,
    });
    await repos.lmwaresCommercialAgentJobs.complete({ id: job.id, runnerId: RUNNER_ID, leaseToken: job.leaseToken!, result: { model: MODEL, offerId: offer.id, demoBrief: draft.demoBrief } });
    await repos.audit.record({ actorType: 'system', actorId: RUNNER_ID, action: 'lmwares.commercial_scope.auto_issued', entityType: 'lmwares_commercial_agent_job', entityId: job.id, metadata: { intakeId: fresh.id, offerId: offer.id, model: MODEL } });
    await notifyOperator(env, { title: 'LMWares · propuesta automática enviada', lines: [`${fresh.brief.businessName} · ${fresh.plan.toUpperCase()}`, `Cliente: ${fresh.brief.contactName}`, `Modelo: ${MODEL}`] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible generar el alcance automático.';
    await repos.lmwaresCommercialAgentJobs.fail({ id: job.id, runnerId: RUNNER_ID, leaseToken: job.leaseToken!, code: 'scope_generation_failed', message }).catch(() => {});
    await notifyOperator(env, { title: 'LMWares · revisión de alcance requerida', lines: [`Job: ${job.id}`, message] });
  }
}

async function draftScope(env: Bindings, intake: PackageIntake): Promise<ScopeDraft> {
  const profile = readBusinessInterview(intake.packageSnapshot);
  return generateCommercialScope(deepseekApiKey(env) ?? undefined, {
    businessName: intake.brief.businessName,
    notes: JSON.stringify({ description: intake.brief.businessSummary, goal: intake.brief.siteGoal, style: intake.brief.stylePreference, references: intake.brief.referenceNotes, businessProfile: profile }),
    plan: intake.plan, modules: intake.modules,
    maintenancePreference: intake.brief.maintenancePlanPreference,
  });
}

function readBusinessInterview(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const value = (snapshot as Record<string, unknown>).businessInterview;
  if (!value || typeof value !== 'object') return null;
  // The request schema already validates this. Keep this defensive fence so
  // legacy or malformed stored snapshots never affect automatic scoping.
  const profile = (value as Record<string, unknown>).profile;
  return profile && typeof profile === 'object' ? profile : null;
}

function deepseekApiKey(env: Bindings): string | null {
  return env.DEEPSEEK_API_KEY?.trim() || env.deepseek_api_key?.trim() || null;
}
import { generateCommercialScope } from '@starter/domain';
