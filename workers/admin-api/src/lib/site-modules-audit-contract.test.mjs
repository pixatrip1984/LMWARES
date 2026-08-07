import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const siteBlogRoute = readFileSync(new URL('../routes/site-blog.ts', import.meta.url), 'utf8');
const siteDocsRoute = readFileSync(new URL('../routes/site-docs.ts', import.meta.url), 'utf8');
const siteFormsRoute = readFileSync(new URL('../routes/site-forms.ts', import.meta.url), 'utf8');
const siteGalleryRoute = readFileSync(new URL('../routes/site-gallery.ts', import.meta.url), 'utf8');
const siteDocsRepository = readFileSync(
  new URL('../../../../packages/db/src/repositories/site-docs.ts', import.meta.url),
  'utf8',
);
const siteFormsRepository = readFileSync(
  new URL('../../../../packages/db/src/repositories/site-forms.ts', import.meta.url),
  'utf8',
);
const siteGalleryRepository = readFileSync(
  new URL('../../../../packages/db/src/repositories/site-gallery.ts', import.meta.url),
  'utf8',
);
const siteEventsRepository = readFileSync(
  new URL('../../../../packages/db/src/repositories/site-events.ts', import.meta.url),
  'utf8',
);

test('blog, gallery and forms mutations emit standard admin audit events', () => {
  for (const source of [siteBlogRoute, siteFormsRoute, siteGalleryRoute]) {
    assert.match(source, /createRepositories\(c\.env\.DB\)\.audit\.record\(/);
    assert.match(source, /actorType: 'admin'/);
    assert.match(source, /entityType: 'lmwares_project'/);
  }

  assert.match(siteBlogRoute, /site_blog\.article\.create/);
  assert.match(siteBlogRoute, /site_blog\.article\.cover\.attach/);
  assert.match(siteGalleryRoute, /site_gallery\.album\.publish/);
  assert.match(siteGalleryRoute, /site_gallery\.image\.delete/);
  assert.match(siteFormsRoute, /site_form\.publish/);
  assert.match(siteFormsRoute, /site_form\.request\.status/);
});

test('docs creation/upload mutations are audited and unpublish stays project-scoped in SQL', () => {
  assert.match(siteDocsRoute, /site_docs\.document\.create/);
  assert.match(siteDocsRoute, /site_docs\.version\.create/);
  assert.match(
    siteDocsRepository,
    /SELECT version_id\s+FROM lmwares_doc_publications\s+WHERE document_id = \? AND project_id = \?/,
  );
  assert.match(
    siteDocsRepository,
    /DELETE FROM lmwares_doc_publications WHERE document_id = \? AND project_id = \?/,
  );
  assert.match(
    siteDocsRepository,
    /FROM lmwares_doc_versions v\s+INNER JOIN lmwares_docs d ON d\.id = v\.document_id\s+WHERE d\.project_id = \? AND d\.id = \?/,
  );
});

test('forms, galleries and event registrations keep project ownership in repository detail queries', () => {
  assert.match(
    siteFormsRepository,
    /INNER JOIN lmwares_site_form_requests request\s+ON request\.id = note\.request_id\s+WHERE note\.request_id = \? AND request\.project_id = \?/,
  );
  assert.match(
    siteFormsRepository,
    /INNER JOIN lmwares_site_form_requests request\s+ON request\.id = history\.request_id\s+WHERE history\.request_id = \? AND request\.project_id = \?/,
  );
  assert.match(
    siteGalleryRepository,
    /WHERE image\.album_id = \? AND album\.project_id = \?/,
  );
  assert.match(
    siteGalleryRepository,
    /WHERE image\.album_id = \? AND publication\.project_id = \?/,
  );
  assert.match(
    siteEventsRepository,
    /INNER JOIN lmwares_events event ON event\.id = registration\.event_id\s+WHERE registration\.event_id = \? AND registration\.id = \? AND event\.project_id = \?/,
  );
});
