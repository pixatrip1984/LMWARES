import assert from 'node:assert/strict';
import test from 'node:test';
import { isClientStarterProject } from './project-classification.ts';

function project(overrides = {}) {
  return { category: 'Sin clasificar', tags: [], ...overrides };
}

test('flags a project as a client Starter site by category', () => {
  assert.equal(isClientStarterProject(project({ category: 'Cliente LMwares' })), true);
});

test('flags a project as a client Starter site by tag', () => {
  assert.equal(isClientStarterProject(project({ tags: ['cloudflare-starter'] })), true);
});

test('treats an unclassified project as internal', () => {
  assert.equal(isClientStarterProject(project()), false);
});

test('treats unrelated categories and tags as internal', () => {
  assert.equal(
    isClientStarterProject(
      project({ category: 'Herramienta interna', tags: ['git', 'package'] }),
    ),
    false,
  );
});
