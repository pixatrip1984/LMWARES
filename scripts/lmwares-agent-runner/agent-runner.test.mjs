import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAgentRunnerService } from './service.mjs';

test('permanece bloqueado sin política local de agentes', async (t) => {
  const fixture = await createFixture({ withPolicy: false });
  t.after(fixture.cleanup);

  const status = await fixture.runner.doctor(fixture.projectId);
  assert.equal(status.enabled, false);
  assert.equal(status.reasonCode, 'policy_missing');
});

test('descubre el proyecto en un worktree detached y devuelve JSON estructurado', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const launched = await fixture.runner.launch(fixture.projectId, discoveryPacket());
  const completed = await fixture.runner.wait(fixture.projectId, launched.batchId);
  assert.equal(completed.status, 'succeeded', JSON.stringify(completed.runs, null, 2));
  assert.equal(completed.runs[0].status, 'succeeded');
  assert.equal(completed.runs[0].branchName, null);
  assert.equal(completed.runs[0].result.sections[0].route, '/');
  assert.match(completed.runs[0].worktreePath, /project-discovery$/);
  assert.equal(git(fixture.repoPath, ['branch', '--show-current']), 'dev');
});

test('lanza implementaciones en paralelo sobre ramas y worktrees separados', async (t) => {
  const fixture = await createFixture({ maxParallel: 2 });
  t.after(fixture.cleanup);

  const launched = await fixture.runner.launch(fixture.projectId, {
    mode: 'implement',
    tasks: [implementationTask('catalog'), implementationTask('quote')],
  });
  const completed = await fixture.runner.wait(fixture.projectId, launched.batchId);

  assert.equal(completed.status, 'succeeded', JSON.stringify(completed.runs, null, 2));
  assert.equal(completed.runs.length, 2);
  assert.ok(completed.runs.every((run) => run.branchName.startsWith('oracle/')));
  assert.ok(completed.runs.every((run) => run.changesPresent === true));
  assert.notEqual(completed.runs[0].worktreePath, completed.runs[1].worktreePath);
  const starts = completed.runs.map((run) => Date.parse(run.startedAt));
  assert.ok(Math.max(...starts) - Math.min(...starts) < 1_000);
});

test('respeta el máximo paralelo fijado por política', async (t) => {
  const fixture = await createFixture({ maxParallel: 1 });
  t.after(fixture.cleanup);

  await assert.rejects(
    () =>
      fixture.runner.launch(fixture.projectId, {
        mode: 'implement',
        tasks: [implementationTask('one'), implementationTask('two')],
      }),
    (error) => error?.code === 'parallel_limit_exceeded' && error?.status === 422,
  );
});

async function createFixture({ withPolicy = true, maxParallel = 4 } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-agents-'));
  const devRoot = path.join(root, 'dev');
  const projectId = 'fixture.mx';
  const repoPath = path.join(devRoot, projectId);
  const worktreesRoot = path.join(devRoot, 'oracle-worktrees');
  const scanPath = path.join(root, 'scan.json');
  const policyPath = path.join(root, 'agent-policy.json');
  const runsRoot = path.join(root, 'agent-runs');
  const designsRoot = path.join(root, 'designs');
  const schemaPath = path.join(root, 'schema.json');
  const stubPath = path.join(root, 'codex-stub.mjs');
  await mkdir(repoPath, { recursive: true });
  await mkdir(designsRoot, { recursive: true });

  for (const required of [
    'apps/admin-web/package.json',
    'apps/public-web/package.json',
    'workers/admin-api/wrangler.toml',
    'workers/public-api/wrangler.toml',
    'turbo.json',
  ]) {
    const filePath = path.join(repoPath, required);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, required.endsWith('.json') ? '{}\n' : '# fixture\n');
  }
  await writeFile(path.join(repoPath, 'AGENTS.md'), '# Fixture\n');
  git(repoPath, ['init']);
  git(repoPath, ['config', 'user.email', 'oracle@example.test']);
  git(repoPath, ['config', 'user.name', 'Oracle Test']);
  git(repoPath, ['checkout', '-b', 'dev']);
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'fixture']);
  git(repoPath, ['remote', 'add', 'origin', 'https://github.com/lmwares/fixture.git']);

  await writeFile(
    scanPath,
    JSON.stringify({
      schemaVersion: 1,
      root: devRoot,
      projects: [{ id: projectId, name: 'Fixture', repo: repoPath }],
    }),
  );
  if (withPolicy) {
    await writeFile(
      policyPath,
      JSON.stringify({
        schemaVersion: 1,
        devRoot,
        worktreesRoot,
        projects: {
          [projectId]: {
            enabled: true,
            repo: repoPath,
            trust: 'trusted-local',
            baseRef: 'dev',
            expectedRemote: 'https://github.com/lmwares/fixture.git',
            expectedPaths: [
              'apps/admin-web/package.json',
              'apps/public-web/package.json',
              'workers/admin-api/wrangler.toml',
              'workers/public-api/wrangler.toml',
              'turbo.json',
            ],
            maxParallel,
            operations: ['discover', 'implement'],
          },
        },
      }),
    );
  }
  await writeFile(schemaPath, '{}\n');
  await writeFile(
    stubPath,
    `import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output-last-message');
const outputPath = args[outputIndex + 1];
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'thread.started', thread_id: '019fixture-thread' }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  const discovery = prompt.includes('agente de descubrimiento visual');
  if (discovery) {
    const result = { projectName: 'Fixture', sections: [{ id: 'home', title: 'Inicio', app: 'public-web', kind: 'page', route: '/', objective: 'Mostrar la portada.', criteria: ['Tiene CTA', 'Funciona en móvil'], sourceFiles: ['apps/public-web/package.json'], dependencies: [] }] };
    writeFileSync(outputPath, JSON.stringify(result));
  } else {
    writeFileSync(path.join(process.cwd(), 'agent-change.txt'), 'implemented');
    writeFileSync(outputPath, 'Implementación lista.');
  }
  setTimeout(() => {
    console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }));
  }, 120);
});
`,
  );

  return {
    projectId,
    repoPath,
    runner: createAgentRunnerService({
      scanPath,
      policyPath,
      runsRoot,
      designsRoot,
      schemaPath,
      codexCommand: { file: process.execPath, prefixArgs: [stubPath] },
      discoveryTimeoutMs: 5_000,
      implementationTimeoutMs: 5_000,
    }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function discoveryPacket() {
  return {
    mode: 'discover',
    tasks: [
      {
        id: 'project-discovery',
        title: 'Descubrimiento',
        route: '*',
        objective: 'Inventariar pantallas.',
        criteria: ['Incluye rutas'],
        sourceFiles: [],
        imagePaths: [],
      },
    ],
  };
}

function implementationTask(id) {
  return {
    id,
    title: id,
    route: `/${id}`,
    objective: `Implementar ${id}.`,
    criteria: ['Completa el objetivo'],
    sourceFiles: [],
    imagePaths: [],
  };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
