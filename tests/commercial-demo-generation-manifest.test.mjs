import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['packages/domain/src/services/commercial-demo-generation-manifest.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { buildDemoGenerationManifest, validateSiteRouteManifest } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const spec = {
  schemaVersion: 'lmwares.demo-build-spec.v1', lifecycleId: 'life-1', intakeId: 'intake-1',
  acceptedOffer: { id: 'offer-1', version: 1, acceptedAt: '2026-09-10T00:00:00.000Z', digest: 'a'.repeat(64), plan: 'starter', modules: ['catalog'], scopeSummary: 'Catálogo público.', implementationDescription: 'Implementación.' },
  business: { name: 'Taller Norte', summary: 'Servicio local.', goal: 'Recibir solicitudes.', stylePreference: 'sobrio' },
  demoBrief: null,
  allowed: { publicModules: ['catalog'], interactions: ['local_catalog_filter'], exclusions: ['payments'] },
  source: { starterCommit: 'd1a10781cb2241ad6bf2536eee8b2148abaa2923', projectPath: null },
  createdAt: '2026-09-10T00:00:00.000Z',
};

test('generation manifest is deterministic and carries only public build-spec context', async () => {
  const one = await buildDemoGenerationManifest({ buildSpecId: 'spec-1', buildSpecDigest: 'b'.repeat(64), spec, slug: 'taller-norte' });
  const two = await buildDemoGenerationManifest({ buildSpecId: 'spec-1', buildSpecDigest: 'b'.repeat(64), spec, slug: 'taller-norte' });
  assert.equal(one.manifestDigest, two.manifestDigest);
  assert.equal(one.manifest.limits.maxImages, 4);
  assert.equal(one.manifest.assetSlots.length, 4);
  assert.deepEqual(one.manifest.informationArchitecture.routes.map((route) => route.path), ['/', '/catalogo']);
  assert.equal(one.manifest.output.prohibitRemoteNetwork, true);
  assert.equal(JSON.stringify(one.manifest).includes('implementationAmount'), false);
  assert.equal(JSON.stringify(one.manifest).includes('contactPhone'), false);
});

test('route manifest refuses duplicated SEO intent and non-canonical paths', () => {
  assert.throws(() => validateSiteRouteManifest({ schemaVersion: 'lmwares.site-route-manifest.v1', routes: [
    { id: 'home', path: '/', artifactPath: 'index.html', intent: 'Presentar servicios.', title: 'Inicio', description: 'Página principal del negocio.', productionIndexable: true },
    { id: 'other', path: '/otra/', artifactPath: 'otra/index.html', intent: 'Presentar servicios.', title: 'Otra', description: 'Página artificial duplicada.', productionIndexable: true },
  ] }), /rutas|canónica/i);
});

test('generation manifest rejects an invalid publication slug', async () => {
  await assert.rejects(() => buildDemoGenerationManifest({ buildSpecId: 'spec-1', buildSpecDigest: 'b'.repeat(64), spec, slug: '../bad' }), /slug/i);
});
