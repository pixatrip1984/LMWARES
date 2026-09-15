#!/usr/bin/env node
/*
 * Browser-only integration fixture. It resembles a server-issued creative run
 * but contains a fictional public brief and no credentials, customer data or
 * Oracle job. It must never be submitted through submit-release.mjs.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectsRoot = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const activeRunPath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(projectsRoot, 'control', 'active-run.json');
const runId = `test_full_demo_${Date.now()}`;
const createdAt = new Date().toISOString();

try {
  const existing = JSON.parse(await readFile(activeRunPath, 'utf8'));
  if (existing?.mode === 'initialization_only' && String(existing?.runId || '').startsWith('test_demo_')) {
    const archived = `${activeRunPath}.fixture-${Date.now()}.json`;
    await rename(activeRunPath, archived);
  } else {
    throw new Error(`Ya existe un run activo (${existing?.runId || 'sin id'}); esta prueba no lo reemplaza.`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const buildSpecDigest = digest(`fixture-build-spec:${runId}`);
const manifest = {
  schemaVersion: 'lmwares.demo-generation-manifest.v1',
  buildSpecId: `fixture_spec_${runId}`,
  buildSpecDigest,
  lifecycleId: `fixture_lifecycle_${runId}`,
  intakeId: `fixture_intake_${runId}`,
  slug: `atelier-umbral-demo-${String(Date.now()).slice(-6)}`,
  profile: 'static-site-v1',
  creative: {
    businessName: 'Atelier Umbral',
    businessSummary: 'Estudio ficticio de cerámica contemporánea que presenta piezas de mesa, objetos decorativos y colecciones de temporada.',
    goal: 'Inspirar una visita al catálogo, mostrar el lenguaje visual de las colecciones y abrir una conversación de compra o colaboración.',
    stylePreference: 'editorial cálido, artesanal y contemporáneo; fotografía con luz natural, arcilla, piedra y composición sobria.',
    publicModules: ['catalog', 'portfolio'],
    interactions: ['contact_form'],
    exclusions: ['payments', 'authentication', 'real_contact_submission'],
  },
  informationArchitecture: {
    schemaVersion: 'lmwares.site-route-manifest.v1',
    routes: [
      { id: 'home', path: '/', artifactPath: 'index.html', intent: 'Presentar la propuesta creativa y el universo público del atelier.', title: 'Atelier Umbral | Cerámica contemporánea', description: 'Colecciones ficticias de cerámica contemporánea para mesa y espacios cotidianos.', productionIndexable: true },
      { id: 'catalog', path: '/catalogo', artifactPath: 'catalogo/index.html', intent: 'Permitir explorar una selección editorial de colecciones y piezas ilustrativas.', title: 'Catálogo | Atelier Umbral', description: 'Explora una selección editorial ficticia de piezas y colecciones de cerámica.', productionIndexable: true },
      { id: 'portfolio', path: '/portafolio', artifactPath: 'portafolio/index.html', intent: 'Mostrar dirección visual, materialidad y composiciones del proyecto.', title: 'Portafolio | Atelier Umbral', description: 'Conoce el lenguaje visual y las composiciones editoriales del atelier.', productionIndexable: true },
      { id: 'contact', path: '/contacto', artifactPath: 'contacto/index.html', intent: 'Explicar cómo iniciar una conversación comercial sin capturar datos reales.', title: 'Contacto | Atelier Umbral', description: 'Una ruta ilustrativa para iniciar una conversación sobre piezas o colaboraciones.', productionIndexable: false },
    ],
  },
  assetSlots: [
    { id: 'hero', purpose: 'Imagen principal editorial que comunica la materialidad de la cerámica contemporánea.', aspectRatio: '16:9', illustrativeOnly: true },
    { id: 'support-1', purpose: 'Imagen de apoyo para mostrar una composición de mesa y detalle de piezas.', aspectRatio: '4:5', illustrativeOnly: true },
    { id: 'support-2', purpose: 'Imagen de apoyo distinta para el catálogo o portafolio, sin repetir la hero.', aspectRatio: '4:5', illustrativeOnly: true },
    { id: 'detail', purpose: 'Detalle visual de textura, esmalte o proceso editorial.', aspectRatio: '1:1', illustrativeOnly: true },
  ],
  limits: { maxImages: 4, maxImageRetouches: 1, maxCandidateReleases: 2 },
  output: {
    requiredPaths: ['lmwares-demo-output.json', 'source/', 'dist/index.html', 'dist/route-manifest.json', 'evidence/creative-plan.json', 'evidence/asset-manifest.json', 'evidence/checksums.json'],
    prohibitRemoteNetwork: true,
  },
  createdAt,
};
const manifestDigest = digest(stableJson(manifest));
const fixture = {
  schemaVersion: 'lmwares.demo-studio-active-run.v1',
  runId,
  jobId: `fixture_job_${runId}`,
  lifecycleId: manifest.lifecycleId,
  mode: 'production',
  status: 'fixture_pending',
  fixture: { kind: 'full-demo-browser-integration', submitAllowed: false, createdAt },
  projectPath: path.join(projectsRoot, 'projects', runId),
  buildSpec: { id: manifest.buildSpecId, digest: buildSpecDigest },
  generationManifest: { id: `fixture_manifest_${runId}`, digest: manifestDigest, schemaVersion: manifest.schemaVersion, manifest },
};
await mkdir(path.dirname(activeRunPath), { recursive: true });
const temporary = `${activeRunPath}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
await rename(temporary, activeRunPath);
console.log(JSON.stringify({
  status: 'full_fixture_ready', runId, slug: manifest.slug, routeCount: manifest.informationArchitecture.routes.length,
  assetCount: manifest.assetSlots.length, activeRunPath,
}, null, 2));

function digest(value) { return createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}
