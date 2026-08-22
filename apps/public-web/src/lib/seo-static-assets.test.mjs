import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicAsset = (name) => new URL(`../../public/${name}`, import.meta.url);

test('the public sitemap lists only canonical, indexable marketing URLs', async () => {
  const sitemap = await readFile(publicAsset('sitemap.xml'), 'utf8');

  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<loc>https:\/\/lmwares\.com\/<\/loc>/);
  assert.doesNotMatch(sitemap, /\/contacto/);
  assert.doesNotMatch(sitemap, /contratar\.lmwares\.com/);
  assert.doesNotMatch(sitemap, /\/pago\//);
  assert.doesNotMatch(sitemap, /\/suscripcion\//);
});

test('robots advertises the canonical sitemap to crawlers', async () => {
  const robots = await readFile(publicAsset('robots.txt'), 'utf8');

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/lmwares\.com\/sitemap\.xml$/m);
});

test('the retired contact route permanently redirects to the canonical home page', async () => {
  const redirects = await readFile(publicAsset('_redirects'), 'utf8');

  assert.match(redirects, /^\/contacto\s+\/\s+301$/m);
});
