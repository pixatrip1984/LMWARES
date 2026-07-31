import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePublicApiUrl, resolveTurnstileSiteKey } from './config.ts';

test('replaces a loopback API when the frontend runs on a public host', () => {
  assert.equal(
    resolvePublicApiUrl('http://127.0.0.1:8887', 'contratar.lmwares.com'),
    'https://api.lmwares.com',
  );
});

test('keeps the loopback API during local development', () => {
  assert.equal(
    resolvePublicApiUrl('http://127.0.0.1:8887', '127.0.0.1'),
    'http://127.0.0.1:8887',
  );
});

test('keeps an explicitly configured public API', () => {
  assert.equal(
    resolvePublicApiUrl('https://api.staging.lmwares.com/', 'preview.pages.dev'),
    'https://api.staging.lmwares.com',
  );
});

test('uses the canonical API when a public build has no configuration', () => {
  assert.equal(resolvePublicApiUrl(undefined, 'contratar.lmwares.com'), 'https://api.lmwares.com');
});

test('disables a production Turnstile key on loopback development hosts', () => {
  assert.equal(resolveTurnstileSiteKey('0x-production-key', '127.0.0.1'), '');
});

test('keeps a Turnstile key on public hosts', () => {
  assert.equal(
    resolveTurnstileSiteKey(' 0x-production-key ', 'contratar.lmwares.com'),
    '0x-production-key',
  );
});
