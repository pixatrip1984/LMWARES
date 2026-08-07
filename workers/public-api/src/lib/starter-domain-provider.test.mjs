import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./starter-domain-provider.ts', import.meta.url), 'utf8');

test('manual remains the default and Cloudflare is an explicit feature flag', () => {
  assert.match(source, /env\.DOMAIN_PROVIDER \?\? 'manual'/);
  assert.match(source, /providerName === 'cloudflare-saas'/);
  assert.match(source, /CLOUDFLARE_SAAS_API_TOKEN/);
});

test('existing records keep their provider when the global flag changes', () => {
  assert.match(source, /requestedProvider \?\? env\.DOMAIN_PROVIDER/);
  assert.match(source, /requestedProvider\?: string \| null/);
});
