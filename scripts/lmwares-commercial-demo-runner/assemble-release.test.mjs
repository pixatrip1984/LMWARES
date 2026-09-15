import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const script = path.resolve('scripts/lmwares-commercial-demo-runner/assemble-release.mjs');

test('ensambla source, rutas, assets, evidencia y ZIP sin permitir referencias remotas', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lmwares-demo-assembly-'));
  const projects = path.join(root, 'projects'); const incoming = path.join(root, 'incoming');
  const runId = 'run_demo_123'; const jobId = 'job_demo_123';
  const routes = [{ id: 'home', path: '/', artifactPath: 'index.html', intent: 'Presentar el negocio.', title: 'Inicio', description: 'Presentación del negocio.', productionIndexable: true }];
  const run = { schemaVersion: 'lmwares.demo-studio-active-run.v1', runId, jobId, leaseToken: 'x'.repeat(24), lifecycleId: 'life_demo_123', projectPath: path.join(projects, 'project'), buildSpec: { digest: 'a'.repeat(64) }, generationManifest: { digest: 'b'.repeat(64), manifest: { assetSlots: [{ id: 'hero' }], informationArchitecture: { routes } } } };
  const downloaded = path.join(incoming, 'LMWARES-DEMO-INCOMING', runId);
  await mkdir(path.join(downloaded, 'assets'), { recursive: true });
  await mkdir(path.join(projects, 'control'), { recursive: true });
  await writeFile(path.join(projects, 'control', 'active-run.json'), JSON.stringify(run));
  await writeFile(path.join(downloaded, 'creative-plan.json'), JSON.stringify({ schema_version: 'lmwares.demo.creative-plan.v1', run_id: runId, assets: [{ id: 'hero', prompt: 'Imagen editorial.' }] }));
  await writeFile(path.join(downloaded, 'code-package.json'), JSON.stringify({ schema_version: 'lmwares.demo.code-package.v1', run_id: runId, files: [
    { path: 'source/README.md', content: 'Editable.' }, { path: 'dist/index.html', content: '<!doctype html><img src="/assets/hero.png">' },
    { path: 'dist/route-manifest.json', content: JSON.stringify({ schema_version: 'invented-by-model', routes: [] }) },
    { path: 'dist/_headers', content: '/*\n  X-Robots-Tag: index, follow' },
  ] }));
  await writeFile(path.join(downloaded, 'assets', 'hero.png'), Buffer.from([137, 80, 78, 71]));
  const env = { LMWARES_DEMO_PROJECTS_ROOT: projects, LMWARES_DEMO_INCOMING_ROOT: incoming };
  const result = await runNode(script, env);
  assert.equal(result.code, 0, result.stderr);
  const release = path.join(projects, '.staging', jobId, runId, 'release');
  assert.match(await readFile(path.join(release, 'dist', 'index.html'), 'utf8'), /assets\/hero\.png/);
  assert.match(await readFile(path.join(release, 'dist', '_headers'), 'utf8'), /noindex, nofollow, noarchive/);
  assert.match(await readFile(path.join(release, 'dist', 'robots.txt'), 'utf8'), /Disallow: \//);
  assert.deepEqual(JSON.parse(await readFile(path.join(release, 'dist', 'route-manifest.json'), 'utf8')), { schemaVersion: 'lmwares.site-route-manifest.v1', routes });
  assert.equal(JSON.parse(await readFile(path.join(release, 'evidence', 'asset-manifest.json'), 'utf8'))[0].id, 'hero');
  const retried = await runNode(script, env);
  assert.equal(retried.code, 0, retried.stderr);
  assert.match(retried.stdout, /"recovered": true/);
  assert.ok((await readFile(path.join(incoming, `${runId}.zip`))).byteLength > 0);
});

function runNode(file, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { env: { ...process.env, ...env }, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject); child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}
