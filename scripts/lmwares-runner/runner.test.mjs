import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { VALIDATOR_CATALOG } from './catalog.mjs';
import { createRunnerService } from './service.mjs';

test('bloquea proyectos sin política local', async (t) => {
  const fixture = await createFixture({ withPolicy: false });
  t.after(fixture.cleanup);

  const status = await fixture.runner.status(fixture.projectId);
  assert.equal(status.enabled, false);
  assert.equal(status.reasonCode, 'policy_missing');
});

test('rechaza una ruta distinta entre escaneo y política', async (t) => {
  const fixture = await createFixture({ mismatchPolicyPath: true });
  t.after(fixture.cleanup);

  const status = await fixture.runner.status(fixture.projectId);
  assert.equal(status.enabled, false);
  assert.equal(status.reasonCode, 'repo_mismatch');
});

test('ejecuta un validador permitido y escribe evidencia', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = await fixture.runner.run(fixture.projectId, 'typecheck');
  assert.equal(result.status, 'passed');
  assert.equal(result.exitCode, 0);
  assert.match(result.stdoutTail, /validator ok/);
  assert.equal(result.command, 'npm run typecheck');

  const evidence = JSON.parse(await readFile(result.artifactPath, 'utf8'));
  assert.equal(evidence.runId, result.runId);
  assert.equal(evidence.environmentPolicy, 'minimal');
});

test('mantiene typecheck de Workers como validador explícito y separado', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = await fixture.runner.run(fixture.projectId, 'workers-typecheck');
  assert.equal(result.status, 'passed');
  assert.equal(result.kind, 'typecheck');
  assert.equal(result.command, 'npm run typecheck:workers');
  assert.match(result.stdoutTail, /workers typecheck ok/);
});

test('registra como failed un script permitido con salida no cero', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = await fixture.runner.run(fixture.projectId, 'build');
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 7);
});

test('redacta secretos comunes antes de persistir stdout', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = await fixture.runner.run(fixture.projectId, 'tests');
  assert.equal(result.status, 'passed');
  assert.doesNotMatch(result.stdoutTail, /super-secret/);
  assert.match(result.stdoutTail, /API_KEY=\[REDACTED\]/);

  const evidence = await readFile(result.artifactPath, 'utf8');
  assert.doesNotMatch(evidence, /super-secret/);
});

test('no acepta ids de validadores fuera del catálogo', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  await assert.rejects(
    () => fixture.runner.run(fixture.projectId, 'deploy-production'),
    (error) => error?.code === 'invalid_validator' && error?.status === 422,
  );
});

test('no hereda variables ajenas a la allowlist del entorno', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  process.env.LMWARES_CREDENTIAL_PROBE = 'must-not-leak';
  try {
    const result = await fixture.runner.run(fixture.projectId, 'workers-dry-run');
    assert.equal(result.status, 'passed');
    assert.match(result.stdoutTail, /probe:missing/);
    assert.doesNotMatch(result.stdoutTail, /must-not-leak/);
  } finally {
    delete process.env.LMWARES_CREDENTIAL_PROBE;
  }
});

test('corta el árbol del proceso al alcanzar el timeout fijo', async (t) => {
  const timeoutCatalog = new Map([
    [
      'typecheck',
      {
        ...VALIDATOR_CATALOG.get('typecheck'),
        timeoutMs: 250,
      },
    ],
  ]);
  const fixture = await createFixture({ typecheckMode: 'slow', catalog: timeoutCatalog });
  t.after(fixture.cleanup);

  const result = await fixture.runner.run(fixture.projectId, 'typecheck');
  assert.equal(result.status, 'blocked');
  assert.equal(result.timedOut, true);
  assert.ok(result.durationMs < 5_000);
});

async function createFixture({
  withPolicy = true,
  mismatchPolicyPath = false,
  typecheckMode = 'pass',
  catalog = VALIDATOR_CATALOG,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lmwares-runner-'));
  const devRoot = path.join(root, 'dev');
  const projectId = 'trusted-fixture';
  const projectPath = path.join(devRoot, projectId);
  const otherProjectPath = path.join(devRoot, 'other-project');
  const scanPath = path.join(root, 'scan.json');
  const policyPath = path.join(root, 'policy.json');
  const runsRoot = path.join(root, 'runs');
  await mkdir(projectPath, { recursive: true });
  await mkdir(otherProjectPath, { recursive: true });

  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify(
      {
        name: projectId,
        private: true,
        scripts: {
          typecheck: `node validator.mjs ${typecheckMode}`,
          'typecheck:workers': 'node validator.mjs workers',
          build: 'node validator.mjs fail',
          test: 'node validator.mjs secret',
          'check:workers': 'node validator.mjs env',
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(projectPath, 'validator.mjs'),
    `const mode = process.argv[2];
if (mode === 'fail') { console.error('expected failure'); process.exit(7); }
if (mode === 'secret') { console.log('API_KEY=super-secret'); process.exit(0); }
if (mode === 'env') { console.log('probe:' + (process.env.LMWARES_CREDENTIAL_PROBE ?? 'missing')); process.exit(0); }
if (mode === 'workers') { console.log('workers typecheck ok'); process.exit(0); }
if (mode === 'slow') { setTimeout(() => console.log('too late'), 5000); }
else { console.log('validator ok'); }
`,
  );
  await writeFile(path.join(otherProjectPath, 'package.json'), JSON.stringify({ private: true }));
  await writeFile(
    scanPath,
    JSON.stringify({
      schemaVersion: 1,
      root: devRoot,
      projects: [{ id: projectId, repo: projectPath }],
    }),
  );

  if (withPolicy) {
    await writeFile(
      policyPath,
      JSON.stringify({
        schemaVersion: 1,
        devRoot,
        projects: {
          [projectId]: {
            enabled: true,
            repo: mismatchPolicyPath ? otherProjectPath : projectPath,
            trust: 'trusted-local',
            validators: Array.from(catalog.keys()),
          },
        },
      }),
    );
  }

  return {
    projectId,
    runner: createRunnerService({ scanPath, policyPath, runsRoot, catalog }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
