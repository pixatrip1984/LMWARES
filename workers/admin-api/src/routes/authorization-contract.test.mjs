import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROUTES = {
  publications: { file: 'publications', router: 'publications' },
  requests: { file: 'requests', router: 'requests' },
  audit: { file: 'audit', router: 'audit' },
  lmwaresProjects: { file: 'lmwares-projects', router: 'lmwaresProjects' },
  siteBlogAdmin: { file: 'site-blog', router: 'siteBlogAdmin' },
  adminSiteGalleries: { file: 'site-gallery', router: 'adminSiteGalleries' },
  siteDocsAdmin: { file: 'site-docs', router: 'siteDocsAdmin' },
  siteForms: { file: 'site-forms', router: 'siteForms' },
  siteEvents: { file: 'site-events', router: 'siteEvents' },
  commercialIntakesAdmin: { file: 'commercial-intakes', router: 'commercialIntakesAdmin' },
  discountCodesAdmin: { file: 'discount-codes', router: 'discountCodesAdmin' },
  stuckPayments: { file: 'stuck-payments', router: 'stuckPayments' },
  starterDomainsAdmin: { file: 'starter-domains', router: 'starterDomainsAdmin' },
  salesActorsAdmin: { file: 'sales-actors', router: 'salesActorsAdmin' },
};

test('every mounted admin mutator declares requireWrite or requireApproval', async () => {
  const index = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  const routes = [...index.matchAll(/app\.route\('([^']+)',\s*(\w+)\)/g)]
    .filter((match) => match[1].startsWith('/admin/'))
    .map((match) => match[2]);
  for (const route of routes) {
    assert.ok(ROUTES[route], `Falta registrar la ruta Admin montada: ${route}`);
    const source = await readFile(new URL(`../routes/${ROUTES[route].file}.ts`, import.meta.url), 'utf8');
    const routerName = ROUTES[route].router;
    // Route declarations may wrap the middleware and handler across lines.
    for (const match of source.matchAll(new RegExp(`${routerName}\\.(post|patch|put|delete)\\([\\s\\S]*?\\basync\\s*\\(`, 'g'))) {
      assert.match(match[0], /requireWrite|requireApproval/, `${route}: ${match[0]}`);
    }
  }
});

test('local fixture auth is restricted to the seeded Admin and production stays closed', async () => {
  const config = await readFile(new URL('../../wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /ADMIN_EMAIL_ALLOWLIST = "admin@example\.com"/);
  assert.match(config, /ACCESS_DISABLED = "1"/);
  assert.match(config, /TEST_FIXTURES_ENABLED = "1"/);
  const production = config.slice(config.lastIndexOf('[env.production.vars]'));
  assert.match(production, /ADMIN_EMAIL_ALLOWLIST = "lmwareservice@gmail\.com"/);
  assert.match(production, /ACCESS_DISABLED = "0"/);
  assert.match(production, /TEST_FIXTURES_ENABLED = "0"/);
});
