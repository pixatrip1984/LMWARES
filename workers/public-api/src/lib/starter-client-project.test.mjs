import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clientProjectRepositorySource = readFileSync(
  new URL(
    '../../../../packages/db/src/repositories/lmwares-starter-client-projects.ts',
    import.meta.url,
  ),
  'utf8',
);
const workOrderRepositorySource = readFileSync(
  new URL(
    '../../../../packages/db/src/repositories/lmwares-starter-work-orders.ts',
    import.meta.url,
  ),
  'utf8',
);
const migrationSource = readFileSync(
  new URL(
    '../../../../infra/d1/migrations/0031_lmwares_starter_client_projects.sql',
    import.meta.url,
  ),
  'utf8',
);
const billingMigrationSource = readFileSync(
  new URL('../../../../infra/d1/migrations/0031_lmwares_starter_client_projects.sql', import.meta.url),
  'utf8',
);
const dbIndexSource = readFileSync(new URL('../../../../packages/db/src/index.ts', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../routes/account.ts', import.meta.url), 'utf8');
const adminCommercialSource = readFileSync(
  new URL('../../../admin-api/src/routes/commercial-intakes.ts', import.meta.url),
  'utf8',
);

test('the client-owned Starter project is separate from the internal Oracle registry', () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS lmw_starter_client_projects/);
  // Must link to the work order and user, and stay one-to-one with the intake.
  assert.match(migrationSource, /work_order_id\s+TEXT NOT NULL UNIQUE/);
  assert.match(migrationSource, /REFERENCES lmw_starter_work_orders\(id\)/);
  assert.match(migrationSource, /intake_id\s+TEXT NOT NULL UNIQUE/);
  assert.match(migrationSource, /REFERENCES lmw_package_intakes\(id\)/);
  assert.match(migrationSource, /user_id\s+TEXT NOT NULL/);
  assert.match(migrationSource, /REFERENCES lmw_users\(id\)/);
  assert.match(migrationSource, /slug\s+TEXT NOT NULL UNIQUE/);
  // Never references lmwares_projects: that registry stays behind
  // workOrder.project_id as the optional internal link.
  assert.doesNotMatch(migrationSource, /REFERENCES lmwares_projects/);
});

test('ensureFromPaidBillingOrder idempotently provisions the client project alongside the work order', () => {
  const methodStart = workOrderRepositorySource.indexOf('async ensureFromPaidBillingOrder');
  const methodEnd = workOrderRepositorySource.indexOf('async getById', methodStart);
  const methodSource = workOrderRepositorySource.slice(methodStart, methodEnd);

  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  assert.match(methodSource, /b\.phase = 1 AND b\.status = 'paid'/);
  assert.match(methodSource, /LmwaresStarterClientProjectsRepository\(this\.db\)\.ensureForWorkOrder/);
  assert.match(
    methodSource,
    /ensureForWorkOrder\(\{\s*workOrderId: workOrder\.id,\s*intakeId: workOrder\.intakeId,\s*userId: workOrder\.userId,/,
  );
});

test('the client project slug is deterministic and resolves collisions instead of trusting client input', () => {
  const ensureStart = clientProjectRepositorySource.indexOf('async ensureForWorkOrder');
  const ensureEnd = clientProjectRepositorySource.indexOf('private async isSlugAvailable', ensureStart);
  const ensureSource = clientProjectRepositorySource.slice(ensureStart, ensureEnd);

  assert.ok(ensureStart >= 0 && ensureEnd > ensureStart);
  // Idempotent: an existing row for this work order short-circuits with no writes.
  assert.match(clientProjectRepositorySource, /const existing = await this\.getByWorkOrderId\(input\.workOrderId\);\s*\n\s*if \(existing\) return existing;/);
  // Slug is derived from the intake's stored business name, not client input.
  assert.match(ensureSource, /SELECT business_name FROM lmw_package_intakes WHERE id = \?/);
  assert.match(ensureSource, /normalizeSlugBase\(intake\.business_name\)/);
  // Collision handling: numeric suffix retry loop bounded by MAX_SLUG_ATTEMPTS.
  assert.match(ensureSource, /for \(let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt \+= 1\)/);
  assert.match(ensureSource, /`\$\{baseSlug\}-\$\{attempt \+ 1\}`/);
  assert.match(ensureSource, /isUniqueConstraint\(error\)/);
  // Reserves the slug in the shared, product-wide namespace to avoid
  // colliding with free-tier subdomains.
  assert.match(ensureSource, /INSERT INTO lmw_slug_reservations/);
});

test('client project slug availability checks the shared namespace, published sites, and its own table', () => {
  const availabilityStart = clientProjectRepositorySource.indexOf('private async isSlugAvailable');
  const availabilitySource = clientProjectRepositorySource.slice(availabilityStart);

  assert.ok(availabilityStart >= 0);
  assert.match(availabilitySource, /FROM lmw_slug_reservations WHERE slug = \?/);
  assert.match(availabilitySource, /FROM lmw_published_sites WHERE slug = \?/);
  assert.match(availabilitySource, /FROM lmw_starter_client_projects WHERE slug = \?/);
});

test('the repository is wired into the shared repositories registry', () => {
  assert.match(dbIndexSource, /lmwaresStarterClientProjects: LmwaresStarterClientProjectsRepository;/);
  assert.match(dbIndexSource, /lmwaresStarterClientProjects: new LmwaresStarterClientProjectsRepository\(db\),/);
});

test('the public account response and admin commercial intake detail expose the client project', () => {
  assert.match(accountSource, /repos\.lmwaresStarterClientProjects\.listForUser\(user\.id\)/);
  assert.match(accountSource, /clientProjectsByWorkOrder/);
  assert.match(accountSource, /clientProject:\s*\n\s*workOrdersByIntake\.has\(intake\.id\)/);

  assert.match(adminCommercialSource, /repos\.lmwaresStarterClientProjects\.getByWorkOrderId\(workOrder\.id\)/);
  assert.match(
    adminCommercialSource,
    /c\.json\(\{ intake, offers, billingOrders, workOrder, clientProject, maintenanceSubscription \}\)/,
  );
});

test('client project lifecycle follows work-order assignment and cancellation', () => {
  assert.match(clientProjectRepositorySource, /async activateForWorkOrder\(workOrderId: string\)/);
  assert.match(clientProjectRepositorySource, /SET status = 'active', updated_at = \?/);
  assert.match(workOrderRepositorySource, /activateForWorkOrder\(input\.id\)/);
  assert.match(clientProjectRepositorySource, /async archiveForWorkOrder\(workOrderId: string\)/);
  assert.match(clientProjectRepositorySource, /SET status = 'archived', updated_at = \?/);
  assert.match(workOrderRepositorySource, /const statements = \[/);
  assert.match(workOrderRepositorySource, /UPDATE lmw_starter_client_projects[\s\S]*?WHERE work_order_id = \? AND status <> 'archived'/);
  assert.match(workOrderRepositorySource, /const \[result\] = await this\.db\.batch\(statements\)/);
});

test('an Oracle project cannot be assigned to two active Starter work orders', () => {
  const assignStart = workOrderRepositorySource.indexOf('async assignProject');
  const assignEnd = workOrderRepositorySource.indexOf('async setStatus', assignStart);
  const assignSource = workOrderRepositorySource.slice(assignStart, assignEnd);

  assert.ok(assignStart >= 0 && assignEnd > assignStart);
  assert.match(assignSource, /NOT EXISTS \(\s*SELECT 1 FROM lmw_starter_work_orders other/);
  assert.match(assignSource, /other\.project_id = \? AND other\.id <> \? AND other\.status <> 'canceled'/);
  assert.match(assignSource, /ya está enlazado a otra orden Starter activa/);
});

test('the client-project migration backfills already-paid phase-one work orders', () => {
  assert.match(billingMigrationSource, /INSERT OR IGNORE INTO lmw_slug_reservations/);
  assert.match(billingMigrationSource, /b\.phase = 1/);
  assert.match(billingMigrationSource, /b\.status = 'paid'/);
  assert.match(billingMigrationSource, /'starter-' \|\| replace\(w\.id, '-', ''\)/);
  assert.match(billingMigrationSource, /INSERT OR IGNORE INTO lmw_starter_client_projects/);
  assert.match(billingMigrationSource, /NOT EXISTS \(\s*SELECT 1 FROM lmw_starter_client_projects/);
});
