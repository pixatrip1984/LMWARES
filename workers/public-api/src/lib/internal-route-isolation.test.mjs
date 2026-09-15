import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = [
  ['freeJobsInternal', '../routes/free-jobs-internal.ts', ['/free-jobs/*', '/free-notifications/*']],
  ['stuckPaymentsInternal', '../routes/stuck-payments-internal.ts', ['/stuck-payments/*']],
  ['googleIndexingInternal', '../routes/google-indexing-internal.ts', ['/google-indexing/*']],
  ['commercialAgentInternal', '../routes/commercial-agent-internal.ts', ['/commercial-demo-jobs/*']],
];

test('internal runners authorize only their own route namespace', () => {
  for (const [router, relativePath, protectedPaths] of routes) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, new RegExp(`${router}\\.use\\('\\*'`));
    for (const protectedPath of protectedPaths) {
      assert.ok(source.includes(`${router}.use('${protectedPath}'`), `${router} must protect ${protectedPath}`);
    }
  }
});
