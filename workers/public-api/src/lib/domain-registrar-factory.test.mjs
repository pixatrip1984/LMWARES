import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./domain-registrar-factory.ts', import.meta.url), 'utf8');

test('manual remains the default and namesilo is an explicit feature flag', () => {
  assert.match(source, /env\.DOMAIN_REGISTRAR_PROVIDER \?\? 'manual'/);
  assert.match(source, /providerName === 'namesilo'/);
  assert.match(source, /NAMESILO_API_KEY/);
});

test('the disabled registrar never calls Namesilo and fails with a clear message', () => {
  assert.match(source, /class DisabledDomainRegistrar implements DomainRegistrar/);
  assert.match(source, /todavía no está habilitada para este entorno/);
});

test('namesilo requires an API key even when explicitly requested', () => {
  assert.match(
    source,
    /if \(providerName === 'namesilo'\) \{\s*const apiKey = env\.NAMESILO_API_KEY\?\.trim\(\);\s*if \(!apiKey\)/,
  );
});

test('porkbun is an explicit feature flag requiring both api keys', () => {
  assert.match(source, /providerName === 'porkbun'/);
  assert.match(source, /PORKBUN_API_KEY/);
  assert.match(source, /PORKBUN_SECRET_API_KEY/);
  assert.match(
    source,
    /if \(providerName === 'porkbun'\) \{\s*const apiKey = env\.PORKBUN_API_KEY\?\.trim\(\);\s*const secretApiKey = env\.PORKBUN_SECRET_API_KEY\?\.trim\(\);\s*if \(!apiKey \|\| !secretApiKey\)/,
  );
});
