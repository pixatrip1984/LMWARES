import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDesignService } from './design-service.mjs';

test('ejecuta imagegen de forma asíncrona y persiste el resultado versionado', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-design-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const designsRoot = path.join(root, 'designs');
  const runsRoot = path.join(root, 'runs');
  const stubPath = path.join(root, 'codex-design-stub.mjs');
  await mkdir(designsRoot, { recursive: true });
  await writeFile(
    stubPath,
    `import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const outputPath = args[args.indexOf('--output-last-message') + 1];
process.stdin.resume();
process.stdin.on('end', () => {
  const image = Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(image, 0);
  image.writeUInt32BE(1672, 16);
  image.writeUInt32BE(941, 20);
  writeFileSync('generated.png', image);
  writeFileSync(outputPath, 'Diseño generado.');
  console.log(JSON.stringify({ type: 'thread.started', thread_id: '019designfixture' }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 20, output_tokens: 4 } }));
});
`,
  );
  const service = createDesignService({
    designsRoot,
    runsRoot,
    codexCommand: { file: process.execPath, prefixArgs: [stubPath] },
    timeoutMs: 5_000,
  });

  const launched = await service.generate('shynolaser.mx', {
    screenId: 'catalog-home',
    frameId: 'hero-audiencias',
    frameTitle: 'Hero para creadores',
    title: 'Catálogo principal',
    route: '/',
    objective: 'Presentar las colecciones y conducir a cotización.',
    instruction: 'Conserva la estructura y amplía el protagonismo del hero.',
    criteria: ['Conserva la marca', 'La cotización es visible'],
    trigger: 'automatic',
    transition: 'Fundido suave desde el estado principal',
    durationMs: 700,
  });
  assert.equal(launched.status, 'queued');
  const completed = await service.wait('shynolaser.mx', launched.jobId);
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.frameId, 'hero-audiencias');
  assert.equal(completed.target.version, 1);
  assert.equal(completed.target.frameId, 'hero-audiencias');
  assert.match(completed.target.imagePath, /catalog-home[\\/]hero-audiencias[\\/]v001\.png$/);
});

test('rechaza generar sin una instrucción de edición explícita', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-design-instruction-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = createDesignService({
    designsRoot: path.join(root, 'designs'),
    runsRoot: path.join(root, 'runs'),
    codexCommand: { file: process.execPath, prefixArgs: [] },
  });

  await assert.rejects(
    service.generate('shynolaser.mx', {
      screenId: 'catalog-home',
      title: 'Catálogo principal',
      route: '/',
      objective: 'Presentar las colecciones.',
      criteria: ['Conserva la marca'],
    }),
    /instruction/,
  );
});
