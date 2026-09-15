import assert from 'node:assert/strict';
import test from 'node:test';
import {
  releaseArtifactPath,
  rewriteReleaseCssForReview,
  rewriteReleaseHtmlForReview,
} from './commercial-demo-review-routing.ts';

const prefix = 'commercial-demos/lifecycle/releases/release/';
const manifest = {
  routes: [
    { path: '/', artifactPath: 'index.html' },
    { path: '/catalogo', artifactPath: 'catalogo/index.html' },
  ],
};

test('review resolver serves declared pages and safe static dependencies', () => {
  assert.equal(releaseArtifactPath(prefix, manifest, '/'), 'index.html');
  assert.equal(releaseArtifactPath(prefix, manifest, '/catalogo'), 'catalogo/index.html');
  assert.equal(releaseArtifactPath(prefix, manifest, '/catalogo/'), 'catalogo/index.html');
  assert.equal(releaseArtifactPath(prefix, manifest, '/styles.css'), 'styles.css');
  assert.equal(releaseArtifactPath(prefix, manifest, '/assets/hero.png'), 'assets/hero.png');
  assert.equal(releaseArtifactPath(prefix, manifest, '/scripts/site.js'), 'scripts/site.js');
});

test('review resolver rejects undeclared HTML and unsafe paths', () => {
  assert.equal(releaseArtifactPath(prefix, manifest, '/inventada'), null);
  assert.equal(releaseArtifactPath(prefix, manifest, '/inventada/index.html'), null);
  assert.equal(releaseArtifactPath(prefix, manifest, '/_headers'), null);
  assert.equal(releaseArtifactPath(prefix, manifest, '/../evidence/checksums.json'), null);
  assert.equal(releaseArtifactPath(prefix, manifest, '/assets/%2e%2e/secret.json'), null);
  assert.equal(releaseArtifactPath('other-prefix/', manifest, '/styles.css'), null);
});

test('review rewriting keeps routes and dependencies under the authenticated proxy', () => {
  const base = '/admin/commercial-intakes/i/demo/releases/r/review/';
  const html = '<html><head><link href="/styles.css"></head><body><a href="/catalogo">Catálogo</a><img src="/assets/hero.png" srcset="/assets/a.png 1x, /assets/b.png 2x"></body></html>';
  const rewritten = rewriteReleaseHtmlForReview(html, base);
  assert.match(rewritten, new RegExp(`href="${base}styles\\.css"`));
  assert.match(rewritten, new RegExp(`href="${base}catalogo"`));
  assert.match(rewritten, new RegExp(`src="${base}assets/hero\\.png"`));
  assert.match(rewritten, new RegExp(`srcset="${base}assets/a\\.png 1x, ${base}assets/b\\.png 2x"`));

  const css = rewriteReleaseCssForReview(".hero{background:url('/assets/hero.png')} @import \"/fonts.css\";", base);
  assert.match(css, new RegExp(`url\\('${base}assets/hero\\.png'\\)`));
  assert.match(css, new RegExp(`@import "${base}fonts\\.css"`));
});
