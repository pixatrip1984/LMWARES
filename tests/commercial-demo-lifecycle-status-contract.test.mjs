import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(
  new URL('../infra/d1/migrations/0039_lmwares_demo_phase_zero.sql', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../packages/db/src/repositories/lmwares-commercial-demo-lifecycles.ts', import.meta.url),
  'utf8',
);

test('literal lifecycle statuses written by the repository are accepted by D1', () => {
  const writtenStatuses = new Set(
    [...repository.matchAll(/lmw_commercial_demo_lifecycles SET [^`]*?status = '([^']+)'/g)].map((match) => match[1]),
  );
  assert.ok(writtenStatuses.size > 0, 'expected to discover lifecycle status writes');
  for (const status of writtenStatuses) {
    assert.match(schema, new RegExp(`'${status}'`), `D1 schema must permit lifecycle status ${status}`);
  }
});
