import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { lmwaresRunnerPlugin } from '../../scripts/lmwares-runner/vite-plugin.mjs';
import { lmwaresAgentRunnerPlugin } from '../../scripts/lmwares-agent-runner/vite-plugin.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const localScanPath = path.join(repoRoot, '.lmwares', 'cache', 'dev-projects.json');
const localRunnerPolicyPath = path.join(repoRoot, '.lmwares', 'runner-policy.local.json');
const localRunsPath = path.join(repoRoot, '.lmwares', 'runs');
const localAgentPolicyPath = path.join(repoRoot, '.lmwares', 'agent-policy.local.json');
const localAgentRunsPath = path.join(repoRoot, '.lmwares', 'agent-runs');
const localDesignRunsPath = path.join(repoRoot, '.lmwares', 'design-runs');
const localDesignsPath = path.join(repoRoot, '.lmwares', 'designs');
const projectMapSchemaPath = path.join(
  repoRoot,
  'scripts',
  'lmwares-agent-runner',
  'schemas',
  'project-map.schema.json',
);

export default defineConfig({
  plugins: [
    react(),
    lmwaresLocalScanPlugin(),
    lmwaresRunnerPlugin({
      scanPath: localScanPath,
      policyPath: localRunnerPolicyPath,
      runsRoot: localRunsPath,
    }),
    lmwaresAgentRunnerPlugin({
      scanPath: localScanPath,
      policyPath: localAgentPolicyPath,
      runsRoot: localAgentRunsPath,
      designRunsRoot: localDesignRunsPath,
      designsRoot: localDesignsPath,
      schemaPath: projectMapSchemaPath,
    }),
  ],
  server: { host: '127.0.0.1', port: 5274, strictPort: true },
});

/** Expone el inventario únicamente en Vite dev; nunca se copia al build. */
function lmwaresLocalScanPlugin(): Plugin {
  return {
    name: 'lmwares-local-scan',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lmwares/local-scan', async (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }

        try {
          const payload = await readFile(localScanPath, 'utf8');
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(payload);
        } catch (error) {
          const code =
            error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          if (code === 'ENOENT') {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: 'local_scan_not_found' }));
            return;
          }
          next(error);
        }
      });
    },
  };
}
