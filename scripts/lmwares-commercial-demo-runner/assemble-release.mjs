#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageDownloadedArtifact } from '../lmwares-demo-native-host/protocol.mjs';

const projectsRoot = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const incomingRoot = process.env.LMWARES_DEMO_INCOMING_ROOT ?? 'C:\\dev\\lmwares-demo-incoming';
const activeRunPath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(projectsRoot, 'control', 'active-run.json');

export async function assembleRelease() {
  const run = JSON.parse(await readFile(activeRunPath, 'utf8'));
  assertRun(run);
  const candidates = [path.join(incomingRoot, run.runId), path.join(incomingRoot, 'LMWARES-DEMO-INCOMING', run.runId)];
  const available = [];
  for (const candidate of candidates) {
    try { await stat(path.join(candidate, 'creative-plan.json')); available.push(candidate); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (available.length !== 1) throw new Error(available.length ? 'Hay dos carpetas de descargas para este run; resuelve la ambigüedad antes de ensamblar.' : `No se encuentran las descargas de ${run.runId}.`);
  const inputDir = available[0];
  const [creativePlan, codePackage] = await Promise.all([
    readJson(path.join(inputDir, 'creative-plan.json')),
    readJson(path.join(inputDir, 'code-package.json')),
  ]);
  validateCreativePlan(creativePlan, run);
  validateCodePackage(codePackage, run);
  const runRoot = path.join(projectsRoot, '.staging', run.jobId, run.runId);
  const releaseRoot = path.join(runRoot, 'release');
  const recovered = await recoverExistingAssembly(run, runRoot, releaseRoot);
  if (recovered) {
    console.log(JSON.stringify({ status: 'assembled', recovered: true, runId: run.runId, releaseRoot, zipPath: recovered.zipPath, zipSha256: recovered.zipSha256 }, null, 2));
    return recovered;
  }
  await mkdir(runRoot, { recursive: true });
  const workRoot = await mkdtemp(path.join(runRoot, '.assembly-'));
  try {
    for (const file of codePackage.files) {
      if (file.path !== 'dist/route-manifest.json') await writeSafe(workRoot, file.path, file.content);
    }
    const routeManifest = canonicalRouteManifest(run.generationManifest.manifest.informationArchitecture);
    await writeSafe(workRoot, 'dist/route-manifest.json', JSON.stringify(routeManifest, null, 2));
    await writeSafe(workRoot, 'dist/_headers', '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n');
    await writeSafe(workRoot, 'dist/robots.txt', 'User-agent: *\nDisallow: /\n');
    const assets = await copyAssets(inputDir, path.join(workRoot, 'dist', 'assets'), run);
    const output = { schemaVersion: 'lmwares.demo-output.v1', runId: run.runId, lifecycleId: run.lifecycleId, buildSpecDigest: run.buildSpec.digest, generationManifestDigest: run.generationManifest.digest, routeManifest, assets, createdAt: new Date().toISOString() };
    await writeSafe(workRoot, 'lmwares-demo-output.json', JSON.stringify(output, null, 2));
    await writeSafe(workRoot, 'evidence/creative-plan.json', JSON.stringify(creativePlan, null, 2));
    await writeSafe(workRoot, 'evidence/asset-manifest.json', JSON.stringify(assets, null, 2));
    const checksums = await checksumsFor(workRoot);
    await writeSafe(workRoot, 'evidence/checksums.json', JSON.stringify(checksums, null, 2));
    await rename(workRoot, releaseRoot);
    const zipPath = path.join(incomingRoot, `${run.runId}.zip`);
    await createZip(releaseRoot, zipPath);
    const staged = await stageDownloadedArtifact({ type: 'stage-download', jobId: run.jobId, runId: run.runId, sourceName: `${run.runId}.zip`, sha256: await sha256File(zipPath) }, { incomingRoot, stagingRoot: path.join(projectsRoot, '.staging') });
    const result = { releaseRoot, zipPath, zipSha256: await sha256File(zipPath), staged, output, checksums };
    await writeJsonAtomic(path.join(runRoot, 'assembly.json'), result);
    console.log(JSON.stringify({ status: 'assembled', runId: run.runId, releaseRoot, zipPath, zipSha256: result.zipSha256 }, null, 2));
    return result;
  } catch (error) {
    await rm(workRoot, { recursive: true, force: true });
    throw error;
  }
}

async function recoverExistingAssembly(run, runRoot, releaseRoot) {
  try { if (!(await stat(releaseRoot)).isDirectory()) throw new Error('La ruta del release existente no es un directorio.'); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  const [output, checksums] = await Promise.all([
    readJson(path.join(releaseRoot, 'lmwares-demo-output.json')),
    readJson(path.join(releaseRoot, 'evidence', 'checksums.json')),
  ]);
  if (output?.schemaVersion !== 'lmwares.demo-output.v1' || output.runId !== run.runId || output.lifecycleId !== run.lifecycleId
    || output.buildSpecDigest !== run.buildSpec.digest || output.generationManifestDigest !== run.generationManifest.digest) {
    throw new Error('El release existente no coincide con el run activo.');
  }
  for (const [relative, expected] of Object.entries(checksums)) {
    if (!safeRelative(relative) && !/^evidence\/[a-z0-9._-]+$/i.test(relative) && relative !== 'lmwares-demo-output.json') throw new Error('El release existente contiene una ruta de checksum inválida.');
    if (await sha256File(path.join(releaseRoot, relative)) !== expected) throw new Error(`El release existente perdió integridad: ${relative}.`);
  }
  const zipPath = path.join(incomingRoot, `${run.runId}.zip`);
  try { await stat(zipPath); } catch (error) { if (error?.code === 'ENOENT') await createZip(releaseRoot, zipPath); else throw error; }
  const zipSha256 = await sha256File(zipPath);
  const staged = await stageDownloadedArtifact({ type: 'stage-download', jobId: run.jobId, runId: run.runId, sourceName: `${run.runId}.zip`, sha256: zipSha256 }, { incomingRoot, stagingRoot: path.join(projectsRoot, '.staging') });
  const result = { releaseRoot, zipPath, zipSha256, staged, output, checksums, recovered: true };
  await writeJsonAtomic(path.join(runRoot, 'assembly.json'), result);
  return result;
}

function assertRun(run) {
  if (run?.schemaVersion !== 'lmwares.demo-studio-active-run.v1' || !safeId(run.runId) || !safeId(run.jobId) || !run.generationManifest?.manifest || !run.buildSpec?.digest) throw new Error('El run activo no es válido para ensamblar.');
}
function safeId(value) { return /^[a-zA-Z0-9_-]{8,120}$/.test(String(value || '')); }
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
function validateCreativePlan(plan, run) {
  if (plan?.schema_version !== 'lmwares.demo.creative-plan.v1' || plan.run_id !== run.runId || !Array.isArray(plan.assets)) throw new Error('El plan creativo no coincide con el run.');
  const expected = run.generationManifest.manifest.assetSlots.map((asset) => asset.id).sort();
  if (expected.join('|') !== plan.assets.map((asset) => asset.id).sort().join('|')) throw new Error('El plan creativo alteró los assets autorizados.');
}
function validateCodePackage(code, run) {
  if (code?.schema_version !== 'lmwares.demo.code-package.v1' || code.run_id !== run.runId || !Array.isArray(code.files) || !code.files.length || code.files.length > 80) throw new Error('El paquete de código no coincide con el run.');
  const paths = new Set();
  for (const file of code.files) {
    if (!safeRelative(file?.path) || typeof file?.content !== 'string' || file.content.length > 300_000 || paths.has(file.path)) throw new Error('El paquete de código contiene archivos inválidos.');
    if (file.path.startsWith('dist/') && /https?:\/\//i.test(file.content)) throw new Error('La demo contiene una dependencia remota no permitida.');
    paths.add(file.path);
  }
  for (const route of run.generationManifest.manifest.informationArchitecture.routes) if (!paths.has(`dist/${route.artifactPath}`)) throw new Error(`Falta el artefacto de ruta ${route.path}.`);
  if (![...paths].some((item) => item.startsWith('source/'))) throw new Error('Falta el código fuente editable.');
}
function safeRelative(value) {
  if (typeof value !== 'string') return false;
  if (value === 'dist/_headers' || value === 'dist/_redirects') return true;
  return /^(?:source|dist)\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/i.test(value)
    && value.split('/').every((part) => !part.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
async function writeSafe(root, relative, content) { if (!safeRelative(relative) && !/^evidence\/[a-z0-9._-]+$/i.test(relative) && relative !== 'lmwares-demo-output.json') throw new Error(`Ruta de salida inválida: ${relative}`); const target = path.resolve(root, relative); if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('La salida salió del release.'); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, 'utf8'); }
async function copyAssets(inputDir, assetDir, run) {
  await mkdir(assetDir, { recursive: true }); const records = [];
  for (const asset of run.generationManifest.manifest.assetSlots) {
    const source = await findAsset(path.join(inputDir, 'assets'), asset.id);
    const extension = path.extname(source).toLowerCase(); const target = path.join(assetDir, `${asset.id}${extension}`);
    await cp(source, target, { force: false, errorOnExist: true });
    records.push({ id: asset.id, path: `dist/assets/${asset.id}${extension}`, sha256: await sha256File(target), bytes: (await stat(target)).size });
  }
  return records;
}
async function findAsset(dir, id) { const entries = await readdir(dir); const match = entries.find((entry) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(png|jpe?g|webp)$`, 'i').test(entry)); if (!match) throw new Error(`No se encontró el asset ${id}.`); return path.join(dir, match); }
function canonicalRouteManifest(informationArchitecture) {
  const routes = informationArchitecture?.routes;
  if (!Array.isArray(routes) || !routes.length) throw new Error('El manifiesto inmutable no contiene rutas.');
  return {
    schemaVersion: informationArchitecture.schemaVersion || 'lmwares.site-route-manifest.v1',
    routes: routes.map(({ id, path: routePath, artifactPath, intent, title, description, productionIndexable }) => ({ id, path: routePath, artifactPath, intent, title, description, productionIndexable })),
  };
}
async function checksumsFor(root) { const files = await listFiles(root); const result = {}; for (const file of files) result[file] = await sha256File(path.join(root, file)); return result; }
async function listFiles(root, relative = '') { const entries = await readdir(path.join(root, relative), { withFileTypes: true }); const output = []; for (const entry of entries) { const next = path.join(relative, entry.name); if (entry.isDirectory()) output.push(...await listFiles(root, next)); else if (entry.isFile()) output.push(next.replace(/\\/g, '/')); } return output.sort(); }
async function sha256File(file) { const data = await readFile(file); return createHash('sha256').update(data).digest('hex'); }
async function writeJsonAtomic(target, value) { await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, target); }
async function createZip(releaseRoot, zipPath) { try { await stat(zipPath); throw new Error('Ya existe un ZIP para este run; no se sobrescribe.'); } catch (error) { if (error?.code !== 'ENOENT') throw error; } await new Promise((resolve, reject) => { const child = spawn('tar', ['-a', '-c', '-f', zipPath, '-C', releaseRoot, '.'], { shell: false }); child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar terminó con código ${code}.`))); }); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) assembleRelease().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
