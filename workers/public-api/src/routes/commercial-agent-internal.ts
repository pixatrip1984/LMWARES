import { Hono, type MiddlewareHandler } from 'hono';
import {
  AppError,
  buildDemoBuildSpec,
  buildDemoGenerationManifest,
  DEMO_BUILD_SPEC_SCHEMA_VERSION,
  DEMO_GENERATION_MANIFEST_SCHEMA_VERSION,
  validateSiteRouteManifest,
  type SiteRouteManifestV1,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import { notifyOperator } from '../lib/operational-alerts';

export const commercialAgentInternal = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Stage 0 pins the exact starter inspected for the first constructor contract.
// The runner must later verify this value before it edits or builds a project.
const DEMO_STARTER_COMMIT = 'd1a10781cb2241ad6bf2536eee8b2148abaa2923';

const requireCommercialDemoRunner: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const raw = c.req.header('Authorization') ?? '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  const runnerToken = c.env.COMMERCIAL_DEMO_RUNNER_TOKEN ?? c.env.LMWARES_COMMERCIAL_DEMO_RUNNER_TOKEN ?? '';
  if (!(await safeTokenEqual(token, runnerToken))) throw AppError.forbidden('Runner de demos no autorizado.');
  await next();
};
commercialAgentInternal.use('/commercial-demo-jobs/*', requireCommercialDemoRunner);

commercialAgentInternal.post('/commercial-demo-jobs/claim', async (c) => {
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId').slice(0, 120);
  if (!runnerId) throw AppError.forbidden('Falta la identidad del runner.');
  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresCommercialAgentJobs.claimNext('demo', runnerId, 45 * 60_000);
  if (!job) return c.json({ job: null });
  const [intake, lifecycle, scope] = await Promise.all([
    repos.lmwaresPackageIntakes.getById(job.intakeId),
    job.lifecycleId ? repos.lmwaresCommercialDemoLifecycles.getById(job.lifecycleId) : null,
    repos.lmwaresCommercialAgentJobs.getForIntake(job.intakeId, 'scope'),
  ]);
  if (!intake || !lifecycle) throw new AppError('conflict', 'El trabajo de demo ya no tiene un expediente válido.');
  const offer = await repos.lmwaresCommercialOffers.getById(lifecycle.commercialOfferId);
  if (!offer || offer.status !== 'accepted' || offer.intakeId !== intake.id) {
    await repos.lmwaresCommercialAgentJobs.fail({ id: job.id, runnerId, leaseToken: job.leaseToken!, code: 'accepted_offer_missing', message: 'La demo necesita una oferta aceptada vinculada al expediente.' });
    throw new AppError('conflict', 'La demo necesita una oferta aceptada vinculada al expediente.');
  }
  const scopeResult = scope?.result?.offerId === offer.id ? scope.result : null;
  let buildSpec = await repos.lmwaresCommercialDemoBuildSpecs.getLatestForLifecycle(lifecycle.id);
  if (!buildSpec) {
    try {
      const created = await buildDemoBuildSpec({
        lifecycleId: lifecycle.id,
        intake,
        acceptedOffer: offer,
        scopeResult,
        starterCommit: DEMO_STARTER_COMMIT,
        // Deterministic snapshot: concurrent claims of the same accepted offer
        // must compute the same digest rather than racing on wall-clock time.
        createdAt: offer.acceptedAt!,
      });
      buildSpec = (await repos.lmwaresCommercialDemoBuildSpecs.create({
        lifecycleId: lifecycle.id,
        intakeId: intake.id,
        acceptedOfferId: offer.id,
        schemaVersion: DEMO_BUILD_SPEC_SCHEMA_VERSION,
        spec: created.spec,
        specDigest: created.specDigest,
      })).buildSpec;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo construir el expediente de demo.';
      await repos.lmwaresCommercialAgentJobs.fail({ id: job.id, runnerId, leaseToken: job.leaseToken!, code: 'demo_build_spec_invalid', message });
      throw new AppError('conflict', 'La demo requiere un expediente válido antes de iniciar.');
    }
  }
  if (buildSpec.acceptedOfferId !== offer.id || buildSpec.schemaVersion !== DEMO_BUILD_SPEC_SCHEMA_VERSION) {
    await repos.lmwaresCommercialAgentJobs.fail({ id: job.id, runnerId, leaseToken: job.leaseToken!, code: 'demo_build_spec_mismatch', message: 'El expediente de demo no coincide con la oferta aceptada.' });
    throw new AppError('conflict', 'El expediente de demo no coincide con la oferta aceptada.');
  }
  let generationManifest = await repos.lmwaresCommercialDemoCreativeStudio.getLatestManifest(lifecycle.id);
  if (!generationManifest) {
    try {
      const generated = await buildDemoGenerationManifest({
        buildSpecId: buildSpec.id,
        buildSpecDigest: buildSpec.specDigest,
        spec: buildSpec.spec,
        slug: lifecycle.slug,
      });
      generationManifest = (await repos.lmwaresCommercialDemoCreativeStudio.createManifest({
        buildSpecId: buildSpec.id,
        lifecycleId: lifecycle.id,
        schemaVersion: DEMO_GENERATION_MANIFEST_SCHEMA_VERSION,
        manifest: generated.manifest,
        manifestDigest: generated.manifestDigest,
      })).manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo construir el manifiesto creativo.';
      await repos.lmwaresCommercialAgentJobs.fail({ id: job.id, runnerId, leaseToken: job.leaseToken!, code: 'demo_generation_manifest_invalid', message });
      throw new AppError('conflict', 'La demo requiere un manifiesto creativo válido antes de iniciar.');
    }
  }
  if (generationManifest.buildSpecId !== buildSpec.id || generationManifest.manifest.buildSpecDigest !== buildSpec.specDigest) {
    await repos.lmwaresCommercialAgentJobs.fail({ id: job.id, runnerId, leaseToken: job.leaseToken!, code: 'demo_generation_manifest_mismatch', message: 'El manifiesto creativo no coincide con el expediente inmutable.' });
    throw new AppError('conflict', 'El manifiesto creativo no coincide con el expediente de demo.');
  }
  const creativeRun = (await repos.lmwaresCommercialDemoCreativeStudio.ensureRun({
    lifecycleId: lifecycle.id,
    jobId: job.id,
    generationManifestId: generationManifest.id,
    executionGeneration: job.executionGeneration,
    candidateNumber: job.attempt,
  })).run;
  return c.json({ job, intake, lifecycle, buildSpec, generationManifest, creativeRun, acceptedOffer: { id: offer.id, status: offer.status, modules: offer.modules, scopeSummary: offer.scopeSummary, implementationDescription: offer.implementationDescription }, scopeResult });
});

commercialAgentInternal.post('/commercial-demo-jobs/:jobId/complete', async (c) => {
  const jobId = c.req.param('jobId')!;
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId').slice(0, 120);
  const leaseToken = readString(body, 'leaseToken').slice(0, 120);
  const projectPath = readString(body, 'projectPath').slice(0, 500);
  const indexHtml = readString(body, 'indexHtml');
  if (!runnerId || !leaseToken || !projectPath || indexHtml.length < 200 || indexHtml.length > 900_000) throw new AppError('validation_error', 'La entrega de demo es inválida.');
  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresCommercialAgentJobs.getById(jobId);
  if (!job || job.jobType !== 'demo' || job.status !== 'claimed' || job.claimedBy !== runnerId || job.leaseToken !== leaseToken || !job.lifecycleId) throw new AppError('forbidden', 'El trabajo no pertenece a este runner.');
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getById(job.lifecycleId);
  if (!lifecycle) throw AppError.notFound('Demo comercial');
  const reviewAssetKey = `commercial-demos/${lifecycle.id}/review-${Date.now()}/index.html`;
  await c.env.MEDIA.put(reviewAssetKey, indexHtml, { httpMetadata: { contentType: 'text/html; charset=UTF-8', cacheControl: 'no-store' } });
  const completed = await repos.lmwaresCommercialAgentJobs.complete({ id: jobId, runnerId, leaseToken, projectPath, result: { reviewAssetKey, reviewUrl: `https://${lifecycle.slug}.lmwares.com`, projectPath } });
  await repos.audit.record({ actorType: 'system', actorId: runnerId, action: 'lmwares.demo.agent_completed', entityType: 'lmwares_commercial_agent_job', entityId: completed.id, metadata: { intakeId: job.intakeId, lifecycleId: lifecycle.id, projectPath, reviewAssetKey } });
  await notifyOperator(c.env, { title: 'LMWares · demo lista para revisión', lines: [`${lifecycle.siteName}`, `Subdominio reservado: https://${lifecycle.slug}.lmwares.com`, `Proyecto local: ${projectPath}`] });
  return c.json({ job: completed, reviewAssetKey });
});

/**
 * Stores one file under the immutable candidate namespace.  The local
 * creative host uploads files before it can submit a release, so a later
 * approval never points at a local path or an unverified browser download.
 */
commercialAgentInternal.put('/commercial-demo-jobs/:jobId/release-files/:assetPath{.+}', async (c) => {
  const jobId = c.req.param('jobId')!;
  const assetPath = decodeURIComponent(c.req.param('assetPath')!);
  const body = await readJsonHeaders(c);
  const runnerId = body.runnerId;
  const leaseToken = body.leaseToken;
  const safePath = normalizeReleaseUploadPath(assetPath);
  if (!runnerId || !leaseToken || !safePath) throw new AppError('validation_error', 'La carga de release es inválida.');
  const bytes = new Uint8Array(await c.req.raw.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) throw new AppError('validation_error', 'El archivo de release supera el límite permitido.');
  const suppliedDigest = (c.req.header('X-LMWares-Content-SHA256') ?? '').toLowerCase();
  const digest = await sha256(bytes);
  if (!/^[a-f0-9]{64}$/.test(suppliedDigest) || suppliedDigest !== digest) throw new AppError('validation_error', 'El checksum del archivo de release no coincide.');
  const repos = createRepositories(c.env.DB);
  const job = await requireClaimedDemoJob(repos, jobId, runnerId, leaseToken);
  const run = await repos.lmwaresCommercialDemoCreativeStudio.getRunForJobGeneration(job.id, job.executionGeneration);
  if (!run) throw new AppError('conflict', 'El run creativo no está preparado.');
  const key = `commercial-demos/${job.lifecycleId}/releases/${run.id}/${safePath}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: releaseContentType(safePath), cacheControl: 'no-store' }, customMetadata: { sha256: digest, creativeRunId: run.id } });
  return c.json({ key, sha256: digest, bytes: bytes.byteLength });
});

/** Finalizes an immutable candidate after every routed artifact exists in R2. */
commercialAgentInternal.post('/commercial-demo-jobs/:jobId/submit-release', async (c) => {
  const jobId = c.req.param('jobId')!;
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId').slice(0, 120);
  const leaseToken = readString(body, 'leaseToken').slice(0, 120);
  const projectPath = readString(body, 'projectPath').slice(0, 500);
  const buildDigest = readDigest(body, 'buildDigest');
  const assetManifestDigest = readDigest(body, 'assetManifestDigest');
  const evidenceDigest = readDigest(body, 'evidenceDigest');
  const routeManifestDigest = readDigest(body, 'routeManifestDigest');
  if (!runnerId || !leaseToken || !projectPath || !buildDigest || !assetManifestDigest || !evidenceDigest || !routeManifestDigest) throw new AppError('validation_error', 'Faltan comprobantes de la release.');
  const routeManifest = readRouteManifest(body);
  try { validateSiteRouteManifest(routeManifest); } catch { throw new AppError('validation_error', 'Las rutas de la release no son válidas.'); }
  if (routeManifestDigest !== await digestJson(routeManifest)) throw new AppError('validation_error', 'El digest del manifiesto de rutas no coincide.');
  const repos = createRepositories(c.env.DB);
  const job = await requireClaimedDemoJob(repos, jobId, runnerId, leaseToken);
  const [lifecycle, buildSpec, manifest, run] = await Promise.all([
    repos.lmwaresCommercialDemoLifecycles.getById(job.lifecycleId!),
    repos.lmwaresCommercialDemoBuildSpecs.getLatestForLifecycle(job.lifecycleId!),
    repos.lmwaresCommercialDemoCreativeStudio.getLatestManifest(job.lifecycleId!),
    repos.lmwaresCommercialDemoCreativeStudio.getRunForJobGeneration(job.id, job.executionGeneration),
  ]);
  if (!lifecycle || !buildSpec || !manifest || !run || run.lifecycleId !== lifecycle.id || run.status === 'failed') throw new AppError('conflict', 'El expediente creativo ya no es válido.');
  if (manifest.buildSpecId !== buildSpec.id || manifest.manifestDigest !== readString(body, 'generationManifestDigest')) throw new AppError('conflict', 'La entrega no coincide con el manifiesto creativo inmutable.');
  if (buildSpec.specDigest !== manifest.manifest.buildSpecDigest) throw new AppError('conflict', 'La entrega no coincide con el expediente de demo.');
  if (!sameRoutePlan(routeManifest, manifest.manifest.informationArchitecture)) {
    throw new AppError('conflict', 'La release intentó cambiar la arquitectura de información autorizada.');
  }
  const artifactPrefix = `commercial-demos/${lifecycle.id}/releases/${run.id}/dist/`;
  const requiredKeys = [
    ...routeManifest.routes.map((route) => `${artifactPrefix}${route.artifactPath}`),
    `${artifactPrefix}route-manifest.json`,
    `commercial-demos/${lifecycle.id}/releases/${run.id}/lmwares-demo-output.json`,
    `commercial-demos/${lifecycle.id}/releases/${run.id}/evidence/creative-plan.json`,
    `commercial-demos/${lifecycle.id}/releases/${run.id}/evidence/asset-manifest.json`,
    `commercial-demos/${lifecycle.id}/releases/${run.id}/evidence/checksums.json`,
  ];
  const missing = (await Promise.all(requiredKeys.map(async (key) => ({ key, object: await c.env.MEDIA.head(key) })))).find(({ object }) => !object);
  if (missing) throw new AppError('conflict', `Falta un artefacto requerido: ${missing.key}.`);
  const routeManifestObject = await c.env.MEDIA.get(`${artifactPrefix}route-manifest.json`);
  const storedRouteManifest = routeManifestObject ? await routeManifestObject.text().catch(() => '') : '';
  let storedRouteDigest = '';
  try { storedRouteDigest = storedRouteManifest ? await digestJson(JSON.parse(storedRouteManifest)) : ''; } catch { storedRouteDigest = ''; }
  if (!storedRouteManifest || storedRouteDigest !== routeManifestDigest) {
    throw new AppError('conflict', 'El archivo de rutas cargado no coincide con la release.');
  }
  const release = await repos.lmwaresCommercialDemoCreativeStudio.createRelease({
    lifecycleId: lifecycle.id, creativeRunId: run.id, buildSpecDigest: buildSpec.specDigest,
    manifestDigest: manifest.manifestDigest, artifactPrefix, buildDigest, assetManifestDigest,
    evidenceDigest, routeManifest, routeManifestDigest,
  });
  await repos.lmwaresCommercialDemoCreativeStudio.setRunStatus({ id: run.id, status: 'submitted', projectPath });
  const completed = await repos.lmwaresCommercialAgentJobs.complete({ id: job.id, runnerId, leaseToken, projectPath, result: { releaseId: release.id, reviewUrl: `https://${lifecycle.slug}.lmwares.com`, projectPath } });
  await repos.audit.record({ actorType: 'system', actorId: runnerId, action: 'lmwares.demo.release.submitted', entityType: 'lmwares_commercial_demo_release', entityId: release.id, metadata: { intakeId: job.intakeId, lifecycleId: lifecycle.id, jobId: job.id, runId: run.id, routeCount: routeManifest.routes.length } });
  await notifyOperator(c.env, { title: 'LMWares · release de demo lista para revisión', lines: [`${lifecycle.siteName}`, `Release: ${release.id}`, `Rutas: ${routeManifest.routes.length}`, `Proyecto local: ${projectPath}`] });
  return c.json({ job: completed, release });
});

commercialAgentInternal.post('/commercial-demo-jobs/:jobId/fail', async (c) => {
  const body = await readJson(c); const runnerId = readString(body, 'runnerId').slice(0, 120); const leaseToken = readString(body, 'leaseToken').slice(0, 120);
  const code = readString(body, 'code', 'demo_runner_failed'); const message = readString(body, 'message', 'No se pudo construir la demo.');
  const repos = createRepositories(c.env.DB);
  if (!leaseToken) throw new AppError('validation_error', 'Falta el lease del trabajo.');
  const failed = await repos.lmwaresCommercialAgentJobs.fail({ id: c.req.param('jobId')!, runnerId, leaseToken, code, message });
  await notifyOperator(c.env, { title: 'LMWares · demo requiere atención', lines: [`Job: ${failed.id}`, message] });
  return c.json({ job: failed });
});

commercialAgentInternal.post('/commercial-demo-jobs/:jobId/heartbeat', async (c) => {
  const body = await readJson(c);
  const runnerId = readString(body, 'runnerId').slice(0, 120);
  const leaseToken = readString(body, 'leaseToken').slice(0, 120);
  if (!runnerId || !leaseToken) throw new AppError('validation_error', 'Falta la identidad o lease del runner.');
  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresCommercialAgentJobs.heartbeat({ id: c.req.param('jobId')!, runnerId, leaseToken });
  return c.json({ job });
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> { try { return await c.req.json(); } catch { throw new AppError('validation_error', 'Cuerpo JSON inválido.'); } }
function readString(body: unknown, key: string, fallback = ''): string { const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : null; return typeof value === 'string' ? value : fallback; }
function readDigest(body: unknown, key: string): string { const value = readString(body, key).toLowerCase(); return /^[a-f0-9]{64}$/.test(value) ? value : ''; }
function readRouteManifest(body: unknown): SiteRouteManifestV1 { const value = body && typeof body === 'object' ? (body as Record<string, unknown>).routeManifest : null; if (!value || typeof value !== 'object') throw new AppError('validation_error', 'Falta el manifiesto de rutas.'); return value as SiteRouteManifestV1; }
async function requireClaimedDemoJob(repos: ReturnType<typeof createRepositories>, jobId: string, runnerId: string, leaseToken: string) {
  const job = await repos.lmwaresCommercialAgentJobs.getById(jobId);
  if (!job || job.jobType !== 'demo' || job.status !== 'claimed' || job.claimedBy !== runnerId || job.leaseToken !== leaseToken || !job.lifecycleId) throw new AppError('forbidden', 'El trabajo no pertenece a este runner.');
  return job;
}
function normalizeReleaseUploadPath(value: string): string | null {
  const path = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path || path.length > 180 || path.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return /^(?:dist\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*|evidence\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*|source\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*|lmwares-demo-output\.json)$/.test(path) ? path : null;
}
function releaseContentType(path: string): string { if (path.endsWith('.html')) return 'text/html; charset=UTF-8'; if (path.endsWith('.css')) return 'text/css; charset=UTF-8'; if (path.endsWith('.js')) return 'text/javascript; charset=UTF-8'; if (path.endsWith('.json')) return 'application/json; charset=UTF-8'; if (path.endsWith('.svg')) return 'image/svg+xml'; if (path.endsWith('.png')) return 'image/png'; if (path.endsWith('.webp')) return 'image/webp'; if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'; return 'application/octet-stream'; }
async function sha256(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function digestJson(value: unknown): Promise<string> { return sha256(new TextEncoder().encode(stableJson(value))); }
function stableJson(value: unknown): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`; }
function sameRoutePlan(actual: SiteRouteManifestV1, expected: SiteRouteManifestV1): boolean { if (actual.routes.length !== expected.routes.length) return false; return expected.routes.every((route) => actual.routes.some((candidate) => candidate.id === route.id && candidate.path === route.path && candidate.artifactPath === route.artifactPath && candidate.intent === route.intent && candidate.productionIndexable === route.productionIndexable)); }
function readJsonHeaders(c: { req: { header: (name: string) => string | undefined } }): { runnerId: string; leaseToken: string } { return { runnerId: c.req.header('X-LMWares-Runner-Id')?.slice(0, 120) ?? '', leaseToken: c.req.header('X-LMWares-Lease-Token')?.slice(0, 120) ?? '' }; }
async function safeTokenEqual(actual: string, expected: string): Promise<boolean> { if (!actual || !expected) return false; const encoder = new TextEncoder(); const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(actual)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]); const a = new Uint8Array(left); const b = new Uint8Array(right); let diff = a.length ^ b.length; for (let index = 0; index < a.length; index += 1) diff |= a[index]! ^ b[index]!; return diff === 0; }
