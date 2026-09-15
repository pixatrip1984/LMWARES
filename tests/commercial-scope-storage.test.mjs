import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['packages/db/src/repositories/lmwares-commercial-operations.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { LmwaresCommercialOperationsRepository } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function fixture(beforeBatch = () => {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE lmw_commercial_operations(id TEXT PRIMARY KEY, row_version INTEGER, status TEXT, current_proposal_id TEXT, updated_at TEXT);
    CREATE TABLE lmw_commercial_operation_assignments(operation_id TEXT, sales_actor_id TEXT, ended_at TEXT);
    CREATE TABLE lmw_commercial_proposals(id TEXT PRIMARY KEY, operation_id TEXT, version INTEGER, status TEXT, rendered_document TEXT, document_digest TEXT, scope_snapshot TEXT, pricing_snapshot TEXT, terms_snapshot TEXT, policy_snapshot TEXT, valid_until TEXT, created_by_actor_id TEXT, created_at TEXT, updated_at TEXT, UNIQUE(operation_id, version));
    INSERT INTO lmw_commercial_operations VALUES('op',1,'draft',NULL,'2026-09-09');
    INSERT INTO lmw_commercial_operation_assignments VALUES('op','seller',NULL);`);
  const db = {
    prepare(query) { return { bind(...args) { return { first: async () => sql.prepare(query).get(...args) ?? null, query, args }; } }; },
    async batch(statements) {
      beforeBatch(sql);
      sql.exec('BEGIN');
      try { const result = statements.map(s => ({ meta: { changes: Number(sql.prepare(s.query).run(...s.args).changes) } })); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const repo = new LmwaresCommercialOperationsRepository(db);
  repo.getForSalesActor = async () => ({ id: 'op', rowVersion: 1, status: 'draft' });
  repo.getById = async () => sql.prepare('SELECT * FROM lmw_commercial_operations WHERE id=?').get('op');
  return { sql, repo };
}
const input = { operationId: 'op', salesActorId: 'seller', expectedRowVersion: 1, renderedDocument: '{}', documentDigest: 'digest', scopeSnapshot: {}, pricingSnapshot: {}, termsSnapshot: {}, policySnapshot: {} };
test('scope save atomically creates readable proposal and advances operation', async () => {
  const { sql, repo } = fixture();
  try {
    const saved = await repo.saveScopeProposalForSalesActor(input);
    assert.equal(saved.operation.status, 'offer_ready');
    assert.equal(saved.operation.current_proposal_id, saved.id);
    assert.equal((await repo.getScopeForSalesActor('op', 'seller')).id, saved.id);
    assert.equal(await repo.getScopeForSalesActor('op', 'foreign'), null);
  } finally { sql.close(); }
});
for (const [name, mutate] of [
  ['concurrent edit', sql => sql.exec('UPDATE lmw_commercial_operations SET row_version=2')],
  ['assignment revoked during generation', sql => sql.exec("UPDATE lmw_commercial_operation_assignments SET ended_at='now'")],
]) test(`${name} cannot create orphan proposal or change operation`, async () => {
  const { sql, repo } = fixture(mutate);
  try {
    await assert.rejects(repo.saveScopeProposalForSalesActor(input), /cambió/);
    assert.equal(sql.prepare('SELECT count(*) AS count FROM lmw_commercial_proposals').get().count, 0);
    assert.equal(sql.prepare('SELECT status FROM lmw_commercial_operations').get().status, 'draft');
  } finally { sql.close(); }
});
