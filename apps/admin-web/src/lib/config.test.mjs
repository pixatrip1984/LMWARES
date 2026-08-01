import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAdminApiUrl } from './config.ts';

test('replaces a loopback API when the admin runs on a public host', () => {
  assert.equal(
    resolveAdminApiUrl('http://127.0.0.1:8888', 'admin.lmwares.com'),
    'https://admin.lmwares.com',
  );
});

test('keeps the loopback API during local development', () => {
  assert.equal(
    resolveAdminApiUrl('http://127.0.0.1:8888', '127.0.0.1'),
    'http://127.0.0.1:8888',
  );
});

test('keeps an explicitly configured public API', () => {
  assert.equal(
    resolveAdminApiUrl('https://admin.staging.lmwares.com/', 'preview.pages.dev'),
    'https://admin.staging.lmwares.com',
  );
});

test('uses the canonical API when a public build has no configuration', () => {
  assert.equal(resolveAdminApiUrl(undefined, 'admin.lmwares.com'), 'https://admin.lmwares.com');
});

test('falls back safely when the configured value is malformed', () => {
  assert.equal(resolveAdminApiUrl('not a URL', 'admin.lmwares.com'), 'https://admin.lmwares.com');
});
