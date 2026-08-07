import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../cloudflare-saas-domain-provider.ts', import.meta.url),
  'utf8',
);

test('Cloudflare adapter uses Custom Hostnames with TXT DV validation', () => {
  assert.match(source, /\/zones\/\$\{encodeURIComponent\(this\.zoneId\)\}\/custom_hostnames/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /method:\s*'txt'/);
  assert.match(source, /type:\s*'dv'/);
});

test('Cloudflare adapter authenticates without exposing the token in diagnostics', () => {
  assert.match(source, /Authorization:\s*`Bearer \$\{this\.apiToken\}`/);
  assert.doesNotMatch(source, /console\.(log|warn|error)\([^)]*apiToken/);
});

test('Cloudflare adapter requires active hostname and certificate before activation', () => {
  assert.match(source, /hostnameStatus === 'active' && sslStatus === 'active'/);
  assert.match(source, /status:\s*'active'/);
  assert.match(source, /status:\s*'provisioning'/);
});

test('Cloudflare adapter treats an already-removed external hostname as removed', () => {
  assert.match(source, /allowNotFound:\s*true/);
  assert.match(source, /response\.status === 404/);
  assert.match(source, /status:\s*'removed'/);
});
