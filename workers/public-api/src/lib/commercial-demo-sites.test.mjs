import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseObjectKey } from './commercial-demo-routing.ts';

const prefix = 'commercial-demos/lifecycle/releases/run/dist/';
const manifest = {
  routes: [
    { path: '/', artifactPath: 'index.html' },
    { path: '/catalogo', artifactPath: 'catalogo/index.html' },
  ],
};

test('commercial demo resolves declared routes and their static dependencies', () => {
  assert.equal(releaseObjectKey(prefix, manifest, '/'), `${prefix}index.html`);
  assert.equal(releaseObjectKey(prefix, manifest, '/catalogo'), `${prefix}catalogo/index.html`);
  assert.equal(releaseObjectKey(prefix, manifest, '/styles.css'), `${prefix}styles.css`);
  assert.equal(releaseObjectKey(prefix, manifest, '/assets/hero.png'), `${prefix}assets/hero.png`);
  assert.equal(releaseObjectKey(prefix, manifest, '/scripts/site.js'), `${prefix}scripts/site.js`);
});

test('commercial demo never exposes undeclared HTML or unsafe paths', () => {
  assert.equal(releaseObjectKey(prefix, manifest, '/inventada'), null);
  assert.equal(releaseObjectKey(prefix, manifest, '/inventada/index.html'), null);
  assert.equal(releaseObjectKey(prefix, manifest, '/_headers'), null);
  assert.equal(releaseObjectKey(prefix, manifest, '/../evidence/checksums.json'), null);
  assert.equal(releaseObjectKey(prefix, manifest, '/assets/%2e%2e/secret.json'), null);
  assert.equal(releaseObjectKey('other-prefix/', manifest, '/styles.css'), null);
});
