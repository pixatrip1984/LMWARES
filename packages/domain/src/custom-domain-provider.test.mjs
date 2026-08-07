import assert from 'node:assert/strict';
import test from 'node:test';
import { ManualCnameDomainProvider } from './custom-domain-provider.ts';

test('manual provider only returns DNS instructions and stays unprovisioned', async () => {
  const provider = new ManualCnameDomainProvider('sites.lmwares.com');
  const registration = await provider.register({
    hostname: 'www.example.com',
    verificationToken: 'token-123',
  });

  assert.equal(registration.status, 'pending_verification');
  assert.deepEqual(registration.instructions, [
    { type: 'CNAME', name: 'www.example.com', value: 'sites.lmwares.com', ttlSeconds: 300 },
    {
      type: 'TXT',
      name: '_lmwares-verify.www.example.com',
      value: 'lmwares-domain-verification=token-123',
      ttlSeconds: 300,
    },
  ]);
  assert.equal((await provider.activate({ hostname: 'www.example.com', externalId: null, verified: false })).status, 'failed');
  assert.equal((await provider.activate({ hostname: 'www.example.com', externalId: null, verified: true })).status, 'provisioning');
});
