import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['packages/domain/src/services/commercial-demo-build-spec.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { buildDemoBuildSpec, stableJson } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const intake = {
  id: 'intake-1',
  brief: {
    contactName: 'Persona privada', contactPhone: '5555555555', businessName: 'Taller Norte',
    businessSummary: 'Reparación de equipos para negocios locales.', siteGoal: 'Explicar servicios y facilitar una solicitud de ejemplo.',
    stylePreference: 'Sobrio y cercano', referenceNotes: 'No debe salir en la demo', customDomainPreference: 'example.mx',
  },
};
const offer = {
  id: 'offer-1', intakeId: 'intake-1', status: 'accepted', acceptedAt: '2026-09-10T00:00:00.000Z', version: 2,
  plan: 'starter', modules: ['landing', 'quote'], scopeSummary: 'Sitio público para presentar servicios.',
  implementationDescription: 'Presentación de servicios y una solicitud de información.', termsVersion: 'v1',
};

test('build spec is deterministic and excludes private intake fields', async () => {
  const input = { lifecycleId: 'life-1', intake, acceptedOffer: offer, starterCommit: 'd1a10781cb2241ad6bf2536eee8b2148abaa2923', createdAt: offer.acceptedAt };
  const first = await buildDemoBuildSpec(input);
  const second = await buildDemoBuildSpec(input);
  assert.equal(first.specDigest, second.specDigest);
  assert.equal(first.spec.acceptedOffer.id, offer.id);
  const serialized = stableJson(first.spec);
  assert.doesNotMatch(serialized, /Persona privada|5555555555|example.mx|referenceNotes/);
  assert.ok(first.spec.allowed.interactions.some((item) => /Formulario de ejemplo/.test(item)));
});

test('a demo spec refuses unaccepted and cross-intake offers', async () => {
  await assert.rejects(buildDemoBuildSpec({ lifecycleId: 'life-1', intake, acceptedOffer: { ...offer, status: 'issued' }, starterCommit: 'd1a10781', createdAt: offer.acceptedAt }), /aceptada/);
  await assert.rejects(buildDemoBuildSpec({ lifecycleId: 'life-1', intake, acceptedOffer: { ...offer, intakeId: 'other' }, starterCommit: 'd1a10781', createdAt: offer.acceptedAt }), /no pertenece/);
});
