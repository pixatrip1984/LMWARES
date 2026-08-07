import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../../infra/d1/migrations/0032_lmwares_custom_domains.sql', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../../../../packages/db/src/repositories/lmwares-custom-domains.ts', import.meta.url),
  'utf8',
);
const publicationRepository = readFileSync(
  new URL('../../../../packages/db/src/repositories/publications.ts', import.meta.url),
  'utf8',
);

test('custom domains belong to client projects, not the internal Oracle registry', () => {
  assert.match(migration, /REFERENCES lmw_starter_client_projects\(id\)/);
  assert.doesNotMatch(migration, /REFERENCES lmwares_projects/);
  assert.match(migration, /client_project_id, type\)/);
  assert.match(migration, /WHERE status <> 'removed'/);
});

test('custom-domain persistence hashes verification ownership and excludes removed records from routing', () => {
  assert.match(repository, /verification_token_hash/);
  assert.match(repository, /getOwnedProject\(input\.clientProjectId, input\.userId\)/);
  assert.match(repository, /WHERE hostname = \? AND status = 'active'/);
  assert.match(repository, /ORDER BY CASE WHEN status = 'removed' THEN 1 ELSE 0 END/);
  assert.match(repository, /status = 'removed'/);
});

test('removed custom domains can be replaced while the current hostname stays unique', () => {
  const migration = readFileSync(
    new URL('../../../../infra/d1/migrations/0034_lmwares_custom_domain_hostname_reuse.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /ALTER TABLE lmw_custom_domains RENAME TO lmw_custom_domains_legacy/);
  assert.match(migration, /CREATE UNIQUE INDEX idx_lmw_custom_domains_hostname_active/);
  assert.match(migration, /ON lmw_custom_domains\(hostname\)\s+WHERE status <> 'removed'/);
});

test('publication edits cannot change status and preserve explicit null clearing', () => {
  const validation = readFileSync(
    new URL('../../../../packages/validation/src/publication.ts', import.meta.url),
    'utf8',
  );
  const route = readFileSync(
    new URL('../../../../workers/admin-api/src/routes/publications.ts', import.meta.url),
    'utf8',
  );

  assert.match(validation, /createPublicationSchema\s*\.omit\(\{ status: true \}\)\s*\.partial\(\)/);
  assert.match(route, /repos\.publications\.update\(id, patch\)/);
  assert.doesNotMatch(route, /summary: patch\.summary \?\? undefined/);
  assert.doesNotMatch(route, /body: patch\.body \?\? undefined/);
  assert.doesNotMatch(route, /coverImageId: patch\.coverImageId \?\? undefined/);
});

test('publication content edits never write the lifecycle status', () => {
  const updateStart = publicationRepository.indexOf('async update(');
  const updateEnd = publicationRepository.indexOf('/** Cambia el estado', updateStart);
  const updateSource = publicationRepository.slice(updateStart, updateEnd);

  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.match(publicationRepository, /UpdatePublicationData = Partial<Omit<CreatePublicationData, 'status'>>/);
  assert.doesNotMatch(updateSource, /status\s*=/);
});
