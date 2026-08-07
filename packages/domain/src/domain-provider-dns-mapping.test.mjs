import assert from 'node:assert/strict';
import test from 'node:test';
import { toRegistrarDnsRecords } from './domain-provider-dns-mapping.ts';

test('the CNAME targeting the apex itself becomes an ALIAS at the root host', () => {
  const records = toRegistrarDnsRecords('shynolaser.com', [
    { type: 'CNAME', name: 'shynolaser.com', value: 'customers.lmwares.com', ttlSeconds: 300 },
  ]);
  assert.deepEqual(records, [
    { type: 'ALIAS', host: '', value: 'customers.lmwares.com', ttlSeconds: 3600 },
  ]);
});

test('a TXT under a subdomain of the root becomes a relative host, not ALIAS', () => {
  const records = toRegistrarDnsRecords('shynolaser.com', [
    {
      type: 'TXT',
      name: '_lmwares-verify.shynolaser.com',
      value: 'lmwares-domain-verification=abc123',
      ttlSeconds: 300,
    },
  ]);
  assert.deepEqual(records, [
    {
      type: 'TXT',
      host: '_lmwares-verify',
      value: 'lmwares-domain-verification=abc123',
      ttlSeconds: 3600,
    },
  ]);
});

test('records outside the purchased root domain are dropped, never sent to the registrar', () => {
  const records = toRegistrarDnsRecords('shynolaser.com', [
    { type: 'TXT', name: 'shynolaser2.com', value: 'unrelated', ttlSeconds: 300 },
  ]);
  assert.deepEqual(records, []);
});

test('the domain match is case-insensitive and a longer provider TTL is preserved', () => {
  const records = toRegistrarDnsRecords('ShynoLaser.com', [
    { type: 'CNAME', name: 'SHYNOLASER.COM', value: 'customers.lmwares.com', ttlSeconds: 7200 },
  ]);
  assert.deepEqual(records, [
    { type: 'ALIAS', host: '', value: 'customers.lmwares.com', ttlSeconds: 7200 },
  ]);
});
