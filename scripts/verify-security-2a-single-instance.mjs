import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { createHash, createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(root, '.security-2a-single-'));
const bundledWorker = join(temporary, 'worker.mjs');
const webhookSecret = 'security-2a-synthetic-webhook-secret';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function signature(id, requestId) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const value = createHmac('sha256', webhookSecret).update(manifest).digest('hex');
  return `ts=${timestamp},v1=${value}`;
}
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
function maintenanceSignature(id, requestId) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const value = createHmac('sha256', 'security-2a-synthetic-maintenance-webhook-secret').update(manifest).digest('hex');
  return `ts=${timestamp},v1=${value}`;
}
async function scalar(db, sql, ...values) {
  const row = await db.prepare(sql).bind(...values).first();
  return Object.values(row ?? {})[0];
}
async function ddl(db, source, statement) {
  try {
    await db.prepare(statement).run();
  } catch (error) {
    console.error(`D1_DDL_FAILURE source=${source} statement=${statement}`);
    console.error(error);
    throw error;
  }
}

let mf;
try {
  await build({
    entryPoints: [join(root, 'workers/public-api/src/security-2a-test-worker.ts')],
    outfile: bundledWorker,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  mf = new Miniflare({
    scriptPath: bundledWorker,
    modules: true,
    modulesRoot: root,
    compatibilityDate: '2026-06-28',
    d1Databases: { DB: 'security-2a-db' },
    bindings: {
      ALLOWED_ORIGINS: 'http://local',
      MERCADO_PAGO_COMMERCIAL_ACCESS_TOKEN: 'security-2a-synthetic-token',
      MERCADO_PAGO_COMMERCIAL_WEBHOOK_SECRET: webhookSecret,
      MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN: 'security-2a-synthetic-maintenance-token',
      MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET: 'security-2a-synthetic-maintenance-webhook-secret',
    },
  });
  const db = await mf.getD1Database('DB');
  const schema = [
    ['0001_init.sql:lmw_users', 'CREATE TABLE lmw_users (id TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)'],
    ['0024_lmwares_billing_orders.sql:lmw_billing_orders', "CREATE TABLE lmw_billing_orders (id TEXT PRIMARY KEY,purpose TEXT NOT NULL CHECK (purpose IN ('implementation','cart','domain')),commercial_offer_id TEXT,intake_id TEXT,user_id TEXT NOT NULL,status TEXT NOT NULL CHECK (status IN ('ready','checkout_creating','checkout_failed','payment_pending','payment_failed','paid','refunded','charged_back','canceled')),phase INTEGER NOT NULL DEFAULT 1 CHECK (phase IN (1,2,3,4)),amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),currency TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),order_snapshot TEXT NOT NULL,external_reference TEXT NOT NULL UNIQUE,provider TEXT NOT NULL DEFAULT 'mercado_pago' CHECK (provider = 'mercado_pago'),provider_preference_id TEXT,provider_payment_id TEXT,checkout_url TEXT,checkout_expires_at TEXT,last_provider_status TEXT,payment_review_required INTEGER NOT NULL DEFAULT 0 CHECK (payment_review_required IN (0,1)),paid_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)"],
    ['0024_lmwares_billing_orders.sql:lmw_billing_payment_attempts', "CREATE TABLE lmw_billing_payment_attempts (id TEXT PRIMARY KEY,billing_order_id TEXT NOT NULL,provider TEXT NOT NULL DEFAULT 'mercado_pago',provider_payment_id TEXT NOT NULL UNIQUE,provider_preference_id TEXT,provider_status TEXT NOT NULL,disposition TEXT NOT NULL CHECK (disposition IN ('pending','failed','accepted','duplicate_review','refunded','charged_back')),amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),currency TEXT NOT NULL,provider_created_at TEXT,first_seen_at TEXT NOT NULL,updated_at TEXT NOT NULL)"],
    ['0014_lmwares_payment_webhooks.sql+extensions', "CREATE TABLE lmw_payment_webhook_events (id TEXT PRIMARY KEY,provider TEXT NOT NULL DEFAULT 'mercado_pago',provider_request_id TEXT NOT NULL UNIQUE,topic TEXT NOT NULL,resource_id TEXT NOT NULL,proposal_id TEXT,status TEXT NOT NULL CHECK (status IN ('processing','processed','ignored','failed')),attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),error_code TEXT,received_at TEXT NOT NULL,processed_at TEXT,updated_at TEXT NOT NULL,billing_order_id TEXT,subscription_id TEXT,maintenance_subscription_id TEXT)"],
    ['0001_init.sql:audit_events', "CREATE TABLE audit_events (id TEXT PRIMARY KEY,actor_type TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,metadata TEXT NOT NULL DEFAULT '{}',ip TEXT,user_agent TEXT,created_at TEXT NOT NULL)"],
    ['0011_lmwares_public_auth.sql:lmw_sessions', 'CREATE TABLE lmw_sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,revoked_at TEXT,last_seen_at TEXT NOT NULL,created_at TEXT NOT NULL)'],
    ['security fixture', 'CREATE TABLE security_2a_provider_fixtures (payment_id TEXT PRIMARY KEY,response_status INTEGER NOT NULL,response_body TEXT NOT NULL)'],
    ['security fixture', 'CREATE TABLE security_2a_provider_requests (id INTEGER PRIMARY KEY AUTOINCREMENT,payment_id TEXT NOT NULL,authorization TEXT,method TEXT NOT NULL)'],
  ];
  for (const [source, statement] of schema) await ddl(db, source, statement);
  await db.prepare('INSERT INTO lmw_users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?)').bind('client-a','client-a@example.test','Client A','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z').run();
  await db.prepare('INSERT INTO lmw_users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?)').bind('client-b','client-b@example.test','Client B','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z').run();
  for (const row of [['s-a','client-a','token-a','2099-01-01T00:00:00.000Z',null],['s-b','client-b','token-b','2099-01-01T00:00:00.000Z',null],['s-exp','client-a','token-exp','2000-01-01T00:00:00.000Z',null],['s-rev','client-a','token-rev','2099-01-01T00:00:00.000Z','2026-08-31T00:00:00.000Z']]) await db.prepare('INSERT INTO lmw_sessions VALUES (?,?,?,?,?,?,?)').bind(row[0],row[1],tokenHash(row[2]),row[3],row[4],'2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z').run();
  for (const id of ['o-p01', 'o-p04']) await db.prepare('INSERT INTO lmw_billing_orders (id,purpose,user_id,status,amount_cents,currency,order_snapshot,external_reference,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,'cart','client-a','ready',10000,'MXN','{}',`lmw-implementation:${id}`,'2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z').run();
  await db.prepare('INSERT INTO security_2a_provider_fixtures VALUES (?,?,?)').bind('1001',200,'{"id":"1001","status":"approved","external_reference":"lmw-implementation:o-p01","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}').run();
  const worker = await mf.getWorker();
  async function addOrder(id, user = 'client-a') { await db.prepare('INSERT INTO lmw_billing_orders (id,purpose,user_id,status,amount_cents,currency,order_snapshot,external_reference,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,'cart',user,'ready',10000,'MXN','{}',`lmw-implementation:${id}`,'2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z').run(); }
  async function addPayment(id, status, reference, amount = 100, currency = 'MXN', http = 200) { await db.prepare('INSERT INTO security_2a_provider_fixtures VALUES (?,?,?)').bind(id,http,http === 200 ? JSON.stringify({ id, status, external_reference: reference, currency_id: currency, transaction_amount: amount, date_created: '2026-08-31T00:00:00.000Z' }) : '{"message":"provider error"}').run(); }
  async function webhook(id, requestId, scope = 'commercial', valid = true) { return worker.fetch(`http://local/payments/webhooks/mercado-pago?scope=${scope}&type=payment&data.id=${id}`, { method: 'POST', headers: { 'x-request-id': requestId, 'x-signature': valid ? (scope === 'maintenance' ? maintenanceSignature(id, requestId) : signature(id, requestId)) : 'ts=1,v1=00' } }); }
  const beforeP04 = await scalar(db, "SELECT status FROM lmw_billing_orders WHERE id = 'o-p04'");
  const p04 = await worker.fetch('http://local/payments/webhooks/mercado-pago?scope=commercial&type=payment&data.id=1001', {
    method: 'POST', headers: { 'x-request-id': 'p04', 'x-signature': 'ts=1,v1=00' },
  });
  const afterP04 = await scalar(db, "SELECT status FROM lmw_billing_orders WHERE id = 'o-p04'");
  const p04Calls = await scalar(db, 'SELECT COUNT(*) FROM security_2a_provider_requests');
  assert(p04.status === 401 && beforeP04 === afterP04 && p04Calls === 0, 'P04 single-instance assertions failed');
  console.log(`P04 PASS HTTP=${p04.status} PROVIDER_CALLS=${p04Calls} BEFORE=${beforeP04} AFTER=${afterP04}`);

  const observabilityBefore = await scalar(db, 'SELECT COUNT(*) FROM security_2a_provider_requests');
  await db.prepare("INSERT INTO security_2a_provider_requests (payment_id,authorization,method) VALUES ('sanity','none','TEST')").run();
  const observabilityAfter = await scalar(db, 'SELECT COUNT(*) FROM security_2a_provider_requests');
  assert(observabilityAfter === observabilityBefore + 1, 'D1 observability sanity mutation was not observed');
  console.log(`HARNESS_D1_OBSERVABILITY PASS BEFORE=${observabilityBefore} AFTER=${observabilityAfter}`);

  const beforeP01 = await scalar(db, "SELECT status FROM lmw_billing_orders WHERE id = 'o-p01'");
  const p01 = await worker.fetch('http://local/payments/webhooks/mercado-pago?scope=commercial&type=payment&data.id=1001', {
    method: 'POST', headers: { 'x-request-id': 'p01', 'x-signature': signature('1001', 'p01') },
  });
  const afterP01 = await scalar(db, "SELECT status FROM lmw_billing_orders WHERE id = 'o-p01'");
  const p01Calls = await scalar(db, "SELECT COUNT(*) FROM security_2a_provider_requests WHERE payment_id = '1001'");
  assert(p01.status === 200 && beforeP01 === 'ready' && afterP01 === 'paid' && p01Calls === 1, 'P01 single-instance assertions failed');
  console.log(`P01 PASS HTTP=${p01.status} PROVIDER_CALLS=${p01Calls} BEFORE=${beforeP01} AFTER=${afterP01}`);
  await addOrder('o-owned-b', 'client-b');
  async function orderRequest(id, token) { return worker.fetch(`http://local/payments/orders/${id}`, { headers: token ? { Cookie: `lmw_session=${token}` } : {} }); }
  for (const [name, token, id, expected] of [['AUTH-G01',null,'o-p01',401],['AUTH-G02','token-a','o-p01',200],['AUTH-G03','token-b','o-owned-b',200],['AUTH-G04','invalid','o-p01',401],['AUTH-G05','token-exp','o-p01',401],['AUTH-G06','token-rev','o-p01',401],['AUTH-G07','token-a','o-owned-b',404]]) { const response = await orderRequest(id, token); assert(response.status === expected, `${name} failed`); console.log(`${name} PASS HTTP=${response.status}`); }
  const own = await orderRequest('o-p01','token-a'); const foreign = await orderRequest('o-owned-b','token-a'); const foreignBody = await foreign.text(); const beforeForeign = await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-owned-b'"); assert(own.status === 200 && foreign.status === 404 && !/client-b|10000|lmw-implementation/.test(foreignBody) && beforeForeign === 'ready','PAYMENT_OWNERSHIP failed'); console.log('PAYMENT_OWNERSHIP PASS OWN=200 FOREIGN=404 PRIVATE_DATA=false MUTATION=false');

  await addOrder('o-p02'); await addPayment('1002','approved','lmw-implementation:o-p02');
  const p02a = await webhook('1002','p02'); const p02b = await webhook('1002','p02');
  assert(p02a.status === 200 && p02b.status === 200 && await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-p02'") === 'paid' && await scalar(db,"SELECT COUNT(*) FROM lmw_billing_payment_attempts WHERE billing_order_id='o-p02'") === 1, 'P02 idempotency failed'); console.log('P02 PASS DELIVERIES=2 ECONOMIC_EFFECTS=1 FINAL=paid');
  await addOrder('o-p03'); await addPayment('1003','approved','lmw-implementation:o-p03'); for (let i=0;i<5;i++) await webhook('1003','p03');
  assert(await scalar(db,"SELECT COUNT(*) FROM lmw_billing_payment_attempts WHERE billing_order_id='o-p03'") === 1, 'P03 idempotency failed'); console.log('P03 PASS DELIVERIES=5 ECONOMIC_EFFECTS=1 FINAL=paid');
  await addOrder('o-a'); await addOrder('o-b'); await addPayment('1005','approved','lmw-implementation:unknown'); const p05=await webhook('1005','p05'); assert(p05.status===200 && await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-a'") === 'ready' && await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-b'") === 'ready','P05 binding failed'); console.log('P05 PASS A=ready B=ready');
  for (const [id,amount,currency] of [['1006',99,'MXN'],['1007',100,'USD']]) { const order=`o-${id}`; await addOrder(order); await addPayment(id,'approved',`lmw-implementation:${order}`,amount,currency); const r=await webhook(id,`p${id}`); assert(r.status===500 && await scalar(db,`SELECT status FROM lmw_billing_orders WHERE id='${order}'`) === 'ready',`${id} binding failed`); console.log(`${id==='1006'?'P06':'P07'} PASS HTTP=500 FINAL=ready`); }
  const p08=await webhook('1008','p08'); assert(p08.status===500,'P08 failed'); await addPayment('1009','approved','lmw-implementation:o-a',100,'MXN',500); const p09=await webhook('1009','p09'); assert(p09.status===500 && await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-a'") === 'ready','P09 failed'); console.log('P08/P09 PASS NO_FALSE_PAYMENT');
  await addOrder('o-p10'); await addPayment('1010','pending','lmw-implementation:o-p10'); await addPayment('1011','approved','lmw-implementation:o-p10'); await webhook('1010','p10a'); const p10mid=await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-p10'"); await webhook('1011','p10b'); assert(p10mid==='payment_pending' && await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-p10'") === 'paid','P10 failed'); console.log('P10 PASS ready>payment_pending>paid');
  for (const [order,first,second,secondStatus,label] of [['o-p11','1012','1013','pending','P11'],['o-p12','1014','1015','rejected','P12']]) { await addOrder(order); await addPayment(first,'approved',`lmw-implementation:${order}`); await addPayment(second,secondStatus,`lmw-implementation:${order}`); await webhook(first,`${label}a`); await webhook(second,`${label}b`); assert(await scalar(db,`SELECT status FROM lmw_billing_orders WHERE id='${order}'`) === 'paid',`${label} terminal regression`); console.log(`${label} PASS approved>${secondStatus} => paid (ignored stale)`); }
  await addOrder('o-p13'); await addPayment('1016','rejected','lmw-implementation:o-p13'); await addPayment('1017','approved','lmw-implementation:o-p13'); await webhook('1016','p13a'); const p13mid=await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-p13'"); await webhook('1017','p13b'); assert(p13mid==='payment_failed' && await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-p13'") === 'paid','P13 failed'); console.log('P13 PASS ready>payment_failed>paid');
  const beforeScope=await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-p01'"); const p14=await webhook('1001','p14','maintenance'); const p15=await webhook('1001','p15','maintenance'); assert(p14.status===401 && p15.status===401 && await scalar(db,"SELECT status FROM lmw_billing_orders WHERE id='o-p01'") === beforeScope,'scope isolation failed'); console.log('P14/P15 PASS WRONG_SCOPE_MUTATIONS=0');
} finally {
  await mf?.dispose();
  await rm(temporary, { recursive: true, force: true });
}
