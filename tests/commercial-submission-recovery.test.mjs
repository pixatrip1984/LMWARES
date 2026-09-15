import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

async function load(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { LmwaresPackageIntakesRepository } = await load('packages/db/src/repositories/lmwares-package-intakes.ts');
const { createHttpClient } = await load('packages/api-client/src/http.ts');
const { prepareCommercialSubmissionKey, replaceCommercialSubmissionKey } = await load('apps/public-web/src/lib/commercialSubmission.ts');
const { notifyOperator } = await load('workers/public-api/src/lib/operational-alerts.ts');
// Real route/schema/auth middleware, with an isolated repository binding.
const repoPlugin = { name: 'fixture-db', setup(builder) {
  builder.onResolve({ filter: /^@starter\/db$/ }, () => ({ path: 'fixture-db', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function createRepositories() { return globalThis.__commercialFixtureRepos; }', loader: 'js' }));
} };
const { commercialIntakes } = await load('workers/public-api/src/routes/commercial-intakes.ts', [repoPlugin]);
const { processQueuedScopeJob } = await load('workers/public-api/src/lib/commercial-scope-agent.ts', [repoPlugin]);
commercialIntakes.onError((error, c) => c.json({ error: { code: error.code, message: error.message } }, error.code === 'conflict' ? 409 : error.code === 'unauthorized' ? 401 : 400));

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=OFF');
  for (const file of ['0022_lmwares_commercial_intakes.sql','0028_lmwares_package_intake_brief.sql','0029_lmwares_package_intake_domain_maintenance.sql']) sql.exec(readFileSync(`infra/d1/migrations/${file}`, 'utf8'));
  sql.exec('ALTER TABLE lmw_package_intakes ADD COLUMN discount_code TEXT; ALTER TABLE lmw_package_intakes ADD COLUMN discount_percent INTEGER; ALTER TABLE lmw_package_intakes ADD COLUMN discount_redemption_id TEXT;');
  const db = { prepare(query) { return { bind(...args) { return {
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
  }; } }; } };
  return { sql, repo: new LmwaresPackageIntakesRepository(db) };
}
const input = () => ({ submissionKey: crypto.randomUUID(), userId: 'fixture-owner', plan: 'starter', modules: ['landing','panel','catalog'], marketing: false,
  brief: { contactName: 'Test', contactPhone: '5555555555', businessName: 'Fixture tienda', businessSummary: 'Productos locales', siteGoal: 'Mostrar catálogo', stylePreference: null, referenceNotes: null, customDomainPreference: null, maintenancePlanPreference: 'later', maintenanceSecurityAddOn: false },
  estimatedImplementationCents: 650000, estimatedMonthlyCents: 0, pricingVersion: 'fixture', discountCode: null,
  packageSnapshot: { businessInterview: { completedAt: 'first', profile: { business: { model: 'products' } } } } });

test('same request and refresh retry preserve one row; changed brief/profile/discount cannot masquerade as success', async () => {
  const { sql, repo } = fixture();
  try {
    const original = input();
    const first = await repo.create(original);
    assert.equal(first.created, true);
    const retry = structuredClone(original); retry.packageSnapshot.businessInterview.completedAt = 'later';
    assert.equal((await repo.create(retry)).created, false);
    for (const modify of [x => x.brief.businessName = 'Different', x => x.packageSnapshot.businessInterview.profile.business.model = 'services', x => x.discountCode = 'PROMO']) {
      const changed = structuredClone(original); modify(changed);
      await assert.rejects(repo.create(changed), /clave de envío/);
    }
    assert.equal(sql.prepare('SELECT count(*) n FROM lmw_package_intakes').get().n, 1);
    assert.equal((await repo.getBySubmissionKey(original.submissionKey)).brief.businessName, original.brief.businessName);
    sql.exec("UPDATE lmw_package_intakes SET status='offer_ready'");
    const changed = structuredClone(original); changed.brief.siteGoal = 'Otro proyecto';
    await assert.rejects(repo.create(changed), /clave de envío/);
    await assert.rejects(repo.create({ ...original, userId: 'another-owner' }), /otra solicitud/);
  } finally { sql.close(); }
});

test('two concurrent different payloads sharing a key cannot both succeed', async () => {
  const { sql, repo } = fixture();
  try {
    const original = input(); const changed = structuredClone(original); changed.brief.businessName = 'Another';
    const results = await Promise.allSettled([repo.create(original), repo.create(changed)]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(results.filter(x => x.status === 'rejected').length, 1);
  } finally { sql.close(); }
});

test('HTTP preserves JSON content type, idempotency key, headers objects, and credentials', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_, init) => {
      assert.equal(init.headers.get('content-type'), 'application/json');
      assert.equal(init.headers.get('accept'), 'application/json');
      assert.equal(init.headers.get('idempotency-key'), 'fixture-key');
      assert.equal(init.credentials, 'include');
      assert.deepEqual(JSON.parse(init.body), { plan: 'starter' });
      return Response.json({ ok: true });
    };
    for (const headers of [{ 'Idempotency-Key': 'fixture-key' }, new Headers({ 'Idempotency-Key': 'fixture-key' }), [['Idempotency-Key', 'fixture-key']]]) {
      await createHttpClient({ baseUrl: 'https://fixture.invalid', withCredentials: true }).post('/intake', { plan: 'starter' }, { headers });
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('browser digest survives refresh, rotates on actual changes and account changes, retains recovery key', async () => {
  const map = new Map(); const storage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) };
  const key = crypto.randomUUID(); const payload = { brief: { businessName: 'Fixture' }, interview: { completedAt: 'first' } };
  assert.equal(await prepareCommercialSubmissionKey(payload, 'owner', key, storage), key);
  payload.interview.completedAt = 'later';
  assert.equal(await prepareCommercialSubmissionKey(payload, 'owner', crypto.randomUUID(), storage), key);
  payload.brief.businessName = 'Changed';
  const changedKey = await prepareCommercialSubmissionKey(payload, 'owner', key, storage);
  assert.notEqual(changedKey, key);
  const replacement = crypto.randomUUID(); replaceCommercialSubmissionKey(replacement, storage);
  assert.equal(await prepareCommercialSubmissionKey(payload, 'owner', key, storage), replacement);
  assert.notEqual(await prepareCommercialSubmissionKey(payload, 'other-owner', key, storage), replacement);
});

test('a synchronous email failure cannot suppress Telegram; true and 1 are supported', async () => {
  const originalFetch = globalThis.fetch; const originalWarn = console.warn; let telegramCalls = 0;
  try {
    globalThis.fetch = async () => { telegramCalls++; return Response.json({ ok: true }); };
    console.warn = () => {};
    for (const flag of ['true', '1']) await notifyOperator({ TELEGRAM_NOTIFICATIONS_ENABLED: flag, TELEGRAM_BOT_TOKEN: 'fixture-not-a-secret', TELEGRAM_CHAT_ID: 'fixture', ADMIN_ALERT_EMAIL: 'fixture@example.invalid', EMAIL: { send() { throw new Error('fixture failure'); } } }, { title: 'Fixture', lines: ['Test'] });
    assert.equal(telegramCalls, 2);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});

test('authenticated HTTP submission queues before acknowledgment, notifies once, survives retry, and scheduler issues scope only once', async () => {
  const { sql, repo } = fixture(); const jobs = new Map(); const offers = []; const background = []; const alerts = [];
  const originalFetch = globalThis.fetch;
  const token = crypto.randomUUID();
  const tokenHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
  globalThis.__commercialFixtureRepos = {
    lmwaresPackageIntakes: repo,
    lmwaresAuth: { getActiveSessionByTokenHash: async hash => hash === tokenHash ? { id: 'fixture-session', user: { id: 'fixture-owner', email: 'fixture@example.invalid' } } : null },
    audit: { record: async () => {} },
    lmwaresCommercialAgentJobs: {
      enqueue: async ({ intakeId }) => { if (!jobs.has(intakeId)) jobs.set(intakeId, { id: crypto.randomUUID(), intakeId, status: 'queued', attempt: 0, maxAttempts: 2, leaseToken: 'fixture-lease' }); return jobs.get(intakeId); },
      claimById: async id => { const job = [...jobs.values()].find(j => j.id === id && j.status === 'queued'); if (job) { job.status = 'claimed'; job.attempt++; } return job ?? null; },
      claimNext: async () => { const job = [...jobs.values()].find(j => j.status === 'queued'); if (job) { job.status = 'claimed'; job.attempt++; } return job ?? null; },
      complete: async ({ id, result }) => Object.assign([...jobs.values()].find(j => j.id === id), { status: 'completed', result }),
      fail: async ({ id, message }) => { const job = [...jobs.values()].find(j => j.id === id); return Object.assign(job, { status: job.attempt < job.maxAttempts ? 'queued' : 'failed', message }); },
    },
    lmwaresCommercialOffers: {
      listForIntake: async intakeId => offers.filter(offer => offer.intakeId === intakeId),
      issue: async data => { const offer = { ...data, id: crypto.randomUUID() }; offers.push(offer); sql.prepare("UPDATE lmw_package_intakes SET status='offer_ready' WHERE id=?").run(data.intakeId); return offer; },
    },
  };
  const env = { ALLOWED_ORIGINS: 'https://fixture.invalid', DEEPSEEK_API_KEY: 'fixture-not-a-secret', TELEGRAM_NOTIFICATIONS_ENABLED: '1', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_CHAT_ID: 'fixture' };
  const original = input();
  const payload = { plan: original.plan, modules: original.modules, marketing: false, brief: original.brief };
  const send = (body = payload, key = original.submissionKey, cookie = `lmw_session=${token}`, requestEnv = env) => commercialIntakes.request('https://api.fixture.invalid/', { method: 'POST', headers: { Origin: 'https://fixture.invalid', Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) }, requestEnv, { waitUntil(promise) { background.push(promise); } });
  try {
    globalThis.fetch = async (url, init) => {
      if (url.startsWith('https://api.telegram.org/')) { alerts.push(JSON.parse(init.body)); return Response.json({ ok: true }); }
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ scopeSummary: 'Presentación del negocio con catálogo informativo y contacto.', demoBrief: { headline: 'Productos locales', subheadline: 'Conoce nuestro catálogo', sections: ['Inicio','Catálogo','Contacto'] } }) } }] });
    };
    assert.equal((await send(payload, original.submissionKey, '')).status, 401);
    const first = await send(); assert.equal(first.status, 201, await first.clone().text());
    assert.equal(jobs.size, 1);
    await Promise.all(background); assert.equal([...jobs.values()][0].status, 'completed');
    assert.equal(alerts.length, 2); assert.ok(alerts.some(alert => /solicitud comercial recibida/.test(alert.text)));
    assert.equal((await send()).status, 200); await Promise.all(background); assert.equal(alerts.length, 2);
    const changed = structuredClone(payload); changed.brief.businessName = 'Other business';
    assert.equal((await send(changed)).status, 409); assert.equal(jobs.size, 1);
    await processQueuedScopeJob(env);
    assert.equal([...jobs.values()][0].status, 'completed', [...jobs.values()][0].message);
    assert.equal(offers.length, 1); assert.equal(alerts.length, 2);
    // Simulate worker loss immediately after issuing an offer: reuse, not reissue.
    [...jobs.values()][0].status = 'queued'; await processQueuedScopeJob(env);
    assert.equal(offers.length, 1); assert.equal(alerts.length, 2);
    assert.equal((await send()).status, 200); assert.equal(jobs.size, 1);
    // Missing provider configuration must leave a tracked job + operator alert,
    // never silently drop the request or fabricate an offer.
    const noKeyEnv = { ...env, DEEPSEEK_API_KEY: undefined };
    assert.equal((await send(changed, crypto.randomUUID(), `lmw_session=${token}`, noKeyEnv)).status, 201);
    await Promise.all(background);
    await processQueuedScopeJob(noKeyEnv);
    const failed = [...jobs.values()].find(job => job.status === 'failed');
    assert.ok(failed); assert.match(failed.message, /DeepSeek no está configurado/);
    assert.equal(offers.length, 1);
    assert.match(alerts.at(-1).text, /revisión de alcance requerida/);
  } finally { sql.close(); globalThis.fetch = originalFetch; delete globalThis.__commercialFixtureRepos; }
});
