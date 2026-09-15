#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectsRoot = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const activeRunPath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(projectsRoot, 'control', 'active-run.json');
const runId = `test_demo_${Date.now()}`;

try {
  const existing = JSON.parse(await readFile(activeRunPath, 'utf8'));
  throw new Error(`Ya existe un run activo (${existing?.runId || 'sin id'}); la prueba no lo reemplaza.`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const fixture = {
  schemaVersion: 'lmwares.demo-studio-active-run.v1',
  runId,
  mode: 'initialization_only',
  status: 'fixture',
  generationManifest: {
    id: `manifest_${runId}`,
    digest: '0'.repeat(64),
    schemaVersion: 'lmwares.demo-generation-manifest.v1',
    manifest: {
      schemaVersion: 'lmwares.demo-generation-manifest.v1', lifecycleId: 'fixture_lifecycle', intakeId: 'fixture_intake', slug: 'prueba-demo-lmwares',
      creative: { businessName: 'Prueba LMWares', businessSummary: 'Prueba de inicialización.', goal: 'Verificar el chat.', stylePreference: null, publicModules: [], interactions: [], exclusions: [] },
      informationArchitecture: { schemaVersion: 'lmwares.site-route-manifest.v1', routes: [{ id: 'home', path: '/', artifactPath: 'index.html', intent: 'Verificar la ruta inicial.', title: 'Prueba', description: 'Prueba técnica de inicialización.', productionIndexable: false }] },
      assetSlots: [{ id: 'hero', purpose: 'No se generará durante esta prueba.', aspectRatio: '16:9', illustrativeOnly: true }],
      limits: { maxImages: 4, maxImageRetouches: 1, maxCandidateReleases: 2 },
      output: { requiredPaths: ['lmwares-demo-output.json', 'source/', 'dist/index.html', 'dist/route-manifest.json', 'evidence/creative-plan.json', 'evidence/asset-manifest.json', 'evidence/checksums.json'], prohibitRemoteNetwork: true },
    },
  },
};
await mkdir(path.dirname(activeRunPath), { recursive: true });
const temporary = `${activeRunPath}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
await rename(temporary, activeRunPath);
console.log(JSON.stringify({ status: 'fixture_ready', runId, activeRunPath }, null, 2));
