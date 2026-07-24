import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunnerService, RunnerError } from './service.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scanPath = path.join(repoRoot, '.lmwares', 'cache', 'dev-projects.json');
const policyPath = path.join(repoRoot, '.lmwares', 'runner-policy.local.json');
const runsRoot = path.join(repoRoot, '.lmwares', 'runs');
const runner = createRunnerService({ scanPath, policyPath, runsRoot });

const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'doctor') {
    if (args.length > 0)
      throw new RunnerError(422, 'invalid_arguments', 'doctor no acepta argumentos.');
    const scan = JSON.parse(await readFile(scanPath, 'utf8'));
    const statuses = [];
    for (const project of scan.projects ?? []) {
      statuses.push(await runner.status(project.id));
    }
    const enabled = statuses.filter((status) => status.enabled);
    console.log(
      JSON.stringify(
        {
          runner: 'lmwares.local-runner/v1',
          scannedProjects: statuses.length,
          enabledProjects: enabled.length,
          projects: statuses.map((status) => ({
            id: status.projectId,
            enabled: status.enabled,
            reasonCode: status.reasonCode,
            validators: status.validators.filter((item) => item.available).map((item) => item.id),
          })),
        },
        null,
        2,
      ),
    );
  } else if (command === 'run') {
    if (args.length !== 2) {
      throw new RunnerError(422, 'invalid_arguments', 'Uso: run <projectId> <validatorId>.');
    }
    console.log(JSON.stringify(await runner.run(args[0], args[1]), null, 2));
  } else {
    throw new RunnerError(422, 'invalid_command', 'Usa doctor o run <projectId> <validatorId>.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Error desconocido del runner.';
  const code = error instanceof RunnerError ? error.code : 'runner_error';
  console.error(JSON.stringify({ error: code, message }));
  process.exitCode = 1;
}
