import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../routes/starter-sites.ts', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

test('Starter wildcard responses are operational, escaped and never cached', () => {
  assert.match(source, /['"]cache-control['"]\s*:\s*['"]no-store['"]/);
  assert.match(source, /['"]x-lmwares-site-type['"]\s*:\s*['"]starter['"]/);
  assert.match(source, /escapeHtml\(input\.siteName\)/);
  assert.match(source, /await repos\.lmwaresStarterClientProjects\.getBySlug\(slug\)/);
});

test('Starter published links are restricted to HTTPS hostnames on the configured base domain', () => {
  assert.match(source, /url\.protocol === ['"]https:['"]/);
  assert.match(source, /hostname\.endsWith\(suffix\)/);
  assert.match(source, /return null/);
});

test('unknown work-order states use a neutral fallback copy', () => {
  assert.match(source, /default:\s*return\s*\{\s*title: ['"]Tu proyecto está siendo preparado/);
});

test('custom hostnames resolve only active domains and reuse the Starter renderer', () => {
  assert.match(source, /getActiveByHostname\(hostname\)/);
  assert.match(source, /getById\(domain\.clientProjectId\)/);
  assert.match(source, /return serveStarterSiteProject\(c, project\)/);
  assert.match(routerSource, /serveStarterSiteByHostname/);
  assert.match(
    routerSource,
    /const customDomainResponse = await serveStarterSiteByHostname\(c, hostname\)/,
  );
});

test('malformed host headers cannot become custom-domain lookup keys', () => {
  assert.match(routerSource, /raw\.startsWith\(['"]\[['"]\)/);
  assert.match(routerSource, /\(\?::\[0-9\]\+\)\?/);
  assert.match(routerSource, /hostname\.endsWith\(['"]\.['"]\)/);
});
