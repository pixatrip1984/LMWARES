import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { GoogleIndexingClient } from './google-indexing.ts';

function makeTestPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey;
}

test('notifyUrlUpdated signs a JWT, exchanges it for a token, then publishes the URL', async () => {
  const privateKeyPem = makeTestPrivateKeyPem();
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input) === 'https://oauth2.googleapis.com/token') {
      const params = new URLSearchParams(init.body);
      assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const assertion = params.get('assertion');
      const [headerB64, payloadB64] = assertion.split('.');
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      assert.equal(header.alg, 'RS256');
      assert.equal(payload.iss, 'test@example.iam.gserviceaccount.com');
      assert.equal(payload.scope, 'https://www.googleapis.com/auth/indexing');
      return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 });
    }
    if (String(input) === 'https://indexing.googleapis.com/v3/urlNotifications:publish') {
      assert.equal(init.headers.Authorization, 'Bearer fake-token');
      const body = JSON.parse(init.body);
      assert.equal(body.url, 'https://acme.sitios.lmwares.com');
      assert.equal(body.type, 'URL_UPDATED');
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${input}`);
  };

  const client = new GoogleIndexingClient({
    clientEmail: 'test@example.iam.gserviceaccount.com',
    privateKeyPem,
    fetchImpl,
  });

  const result = await client.notifyUrlUpdated('https://acme.sitios.lmwares.com');
  assert.deepEqual(result, { ok: true, url: 'https://acme.sitios.lmwares.com' });
  assert.equal(calls.length, 2);
});

test('notifyUrlUpdated is best-effort: returns ok:false instead of throwing on failure', async () => {
  const privateKeyPem = makeTestPrivateKeyPem();
  const fetchImpl = async () =>
    new Response('quota exceeded', { status: 429 });

  const client = new GoogleIndexingClient({
    clientEmail: 'test@example.iam.gserviceaccount.com',
    privateKeyPem,
    fetchImpl,
  });

  const result = await client.notifyUrlUpdated('https://acme.sitios.lmwares.com');
  assert.equal(result.ok, false);
  assert.equal(result.url, 'https://acme.sitios.lmwares.com');
  assert.match(result.reason, /Google OAuth token request failed with status 429/);
});

test('notifyUrlUpdated accepts a PEM with literal \\n escapes (as loaded from a secret)', async () => {
  const privateKeyPem = makeTestPrivateKeyPem().replace(/\n/g, '\\n');
  const fetchImpl = async (input) => {
    if (String(input) === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const client = new GoogleIndexingClient({
    clientEmail: 'test@example.iam.gserviceaccount.com',
    privateKeyPem,
    fetchImpl,
  });

  const result = await client.notifyUrlUpdated('https://acme.sitios.lmwares.com');
  assert.deepEqual(result, { ok: true, url: 'https://acme.sitios.lmwares.com' });
});
