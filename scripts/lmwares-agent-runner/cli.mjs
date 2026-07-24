import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentRunnerService, AgentRunnerError } from './service.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scanPath = path.join(repoRoot, '.lmwares', 'cache', 'dev-projects.json');
const policyPath = path.join(repoRoot, '.lmwares', 'agent-policy.local.json');
const runsRoot = path.join(repoRoot, '.lmwares', 'agent-runs');
const designsRoot = path.join(repoRoot, '.lmwares', 'designs');
const schemaPath = path.join(
  repoRoot,
  'scripts',
  'lmwares-agent-runner',
  'schemas',
  'project-map.schema.json',
);
const runner = createAgentRunnerService({
  scanPath,
  policyPath,
  runsRoot,
  designsRoot,
  schemaPath,
});

const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'doctor') {
    if (args.length !== 1) {
      throw new AgentRunnerError(422, 'invalid_arguments', 'Uso: doctor <projectId>.');
    }
    console.log(JSON.stringify(await runner.doctor(args[0]), null, 2));
  } else if (command === 'status') {
    if (args.length < 1 || args.length > 2) {
      throw new AgentRunnerError(422, 'invalid_arguments', 'Uso: status <projectId> [batchId].');
    }
    console.log(JSON.stringify(await runner.status(args[0], args[1] ?? null), null, 2));
  } else if (command === 'discover') {
    if (args.length !== 1) {
      throw new AgentRunnerError(422, 'invalid_arguments', 'Uso: discover <projectId>.');
    }
    const launched = await runner.launch(args[0], {
      mode: 'discover',
      tasks: [
        {
          id: 'project-discovery',
          title: 'Descubrimiento visual del proyecto',
          route: '*',
          objective: 'Inventariar las pantallas visuales activas del proyecto.',
          criteria: [
            'Incluye rutas públicas activas',
            'Incluye superficies administrativas activas',
            'Excluye redirecciones y módulos no visuales',
            'Relaciona cada pantalla con sus archivos fuente',
          ],
          sourceFiles: [],
          imagePaths: [],
        },
      ],
    });
    console.error(`Lote ${launched.batchId} iniciado; esperando resultado...`);
    console.log(JSON.stringify(await runner.wait(args[0], launched.batchId), null, 2));
  } else if (command === 'launch') {
    if (args.length !== 2) {
      throw new AgentRunnerError(
        422,
        'invalid_arguments',
        'Uso: launch <projectId> <packet.json>.',
      );
    }
    const packet = JSON.parse(await readFile(path.resolve(args[1]), 'utf8'));
    const launched = await runner.launch(args[0], packet);
    console.error(`Lote ${launched.batchId} iniciado; esperando resultado...`);
    console.log(JSON.stringify(await runner.wait(args[0], launched.batchId), null, 2));
  } else {
    throw new AgentRunnerError(
      422,
      'invalid_command',
      'Usa doctor, status, discover o launch.',
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  const code = error instanceof AgentRunnerError ? error.code : 'agent_runner_error';
  console.error(JSON.stringify({ error: code, message }));
  process.exitCode = 1;
}
