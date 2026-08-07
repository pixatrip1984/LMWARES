import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicationsRoute = readFileSync(new URL('../routes/publications.ts', import.meta.url), 'utf8');
const blogRoute = readFileSync(new URL('../routes/site-blog.ts', import.meta.url), 'utf8');
const docsRoute = readFileSync(new URL('../routes/site-docs.ts', import.meta.url), 'utf8');
const eventsRoute = readFileSync(new URL('../routes/site-events.ts', import.meta.url), 'utf8');
const formsRoute = readFileSync(new URL('../routes/site-forms.ts', import.meta.url), 'utf8');
const galleryRoute = readFileSync(new URL('../routes/site-gallery.ts', import.meta.url), 'utf8');

test('public routes only use published content entry points', () => {
  assert.match(publicationsRoute, /repos\.publications\.listPublished\(/);
  assert.match(publicationsRoute, /repos\.publications\.getPublishedBySlug\(/);

  assert.match(blogRoute, /repo\.listPublishedForProject\(projectId, query\)/);
  assert.match(blogRoute, /repo\.getPublishedBySlug\(projectId, slug\)/);

  assert.match(docsRoute, /listPublished\(projectId\)/);
  assert.match(docsRoute, /getPublishedFile\(projectId, documentId\)/);

  assert.match(eventsRoute, /repository\.listPublic\(projectId\)/);
  assert.match(eventsRoute, /repository\.getPublicById\(projectId, eventId\)/);

  assert.match(formsRoute, /getPublishedForProject\(c\.req\.param\('projectId'\)!\)/);
  assert.match(formsRoute, /const published = await repository\.getPublishedForProject\(projectId\)/);

  assert.match(galleryRoute, /gallery\.listPublished\(projectId, q\)/);
  assert.match(galleryRoute, /gallery\.getPublishedBySlug\(projectId, slug\)/);
});
