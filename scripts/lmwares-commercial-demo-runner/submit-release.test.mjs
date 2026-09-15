import test from 'node:test';
import assert from 'node:assert/strict';
import { isRemoteReleaseArtifact } from './submit-release.mjs';

test('remote release excludes local source and platform control files', () => {
  assert.equal(isRemoteReleaseArtifact('dist/index.html'), true);
  assert.equal(isRemoteReleaseArtifact('dist/catalogo/index.html'), true);
  assert.equal(isRemoteReleaseArtifact('dist/assets/hero.png'), true);
  assert.equal(isRemoteReleaseArtifact('dist/_headers'), false);
  assert.equal(isRemoteReleaseArtifact('dist/_redirects'), false);
  assert.equal(isRemoteReleaseArtifact('source/README.md'), false);
  assert.equal(isRemoteReleaseArtifact('source/site.css'), false);
  assert.equal(isRemoteReleaseArtifact('evidence/checksums.json'), true);
  assert.equal(isRemoteReleaseArtifact('lmwares-demo-output.json'), true);
});
