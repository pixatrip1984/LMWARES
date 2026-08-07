import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../namesilo-domain-registrar.ts', import.meta.url),
  'utf8',
);

test('Namesilo registrar authenticates via query string and never logs the api key', () => {
  assert.match(source, /url\.searchParams\.set\('key', this\.apiKey\)/);
  assert.doesNotMatch(source, /console\.\w+\([^)]*apiKey/);
});

test('Namesilo registrar treats 300 and 301 reply codes as success', () => {
  assert.match(source, /code !== 300 && code !== 301/);
});

test('Namesilo registrar enforces a minimum DNS TTL of 3600s', () => {
  assert.match(source, /Math\.max\(record\.ttlSeconds, 3600\)/);
});

test('Namesilo registrar maps the apex host ("@") to an empty rrhost for ALIAS records', () => {
  assert.match(source, /record\.host === '@' \? '' : record\.host/);
});

test('Namesilo registrar reuses the shared checkRegistration reply parser', () => {
  assert.match(source, /mapCheckRegistrationReply\(domains, reply\)/);
});

test('Namesilo registrar surfaces network failures as a friendly AppError', () => {
  assert.match(
    source,
    /El registrador de dominios no respondió a tiempo\./,
  );
});
