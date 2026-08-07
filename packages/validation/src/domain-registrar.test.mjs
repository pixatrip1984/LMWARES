import assert from 'node:assert/strict';
import test from 'node:test';
import {
  domainPurchaseSchema,
  domainSearchSchema,
  normalizeDomainSld,
  normalizeRegistrableDomain,
} from './domain-registrar.ts';

test('normalizeDomainSld accepts a plain label and rejects dots/symbols', () => {
  assert.equal(normalizeDomainSld('  ShynoLaser  '), 'shynolaser');
  assert.throws(() => normalizeDomainSld('shyno.laser'));
  assert.throws(() => normalizeDomainSld('-shynolaser'));
  assert.throws(() => normalizeDomainSld('123'));
  assert.throws(() => normalizeDomainSld(''));
});

test('domainSearchSchema normalizes the sld and reports friendly errors', () => {
  const parsed = domainSearchSchema.safeParse({ sld: 'ShynoLaser' });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.sld, 'shynolaser');

  const invalid = domainSearchSchema.safeParse({ sld: 'shyno laser' });
  assert.equal(invalid.success, false);
});

test('normalizeRegistrableDomain only accepts the offered TLD list, at the apex', () => {
  assert.deepEqual(normalizeRegistrableDomain('ShynoLaser.COM'), {
    domain: 'shynolaser.com',
    sld: 'shynolaser',
    tld: 'com',
  });
  assert.deepEqual(normalizeRegistrableDomain('shynolaser.com.mx'), {
    domain: 'shynolaser.com.mx',
    sld: 'shynolaser',
    tld: 'com.mx',
  });
  assert.throws(() => normalizeRegistrableDomain('shynolaser.io'));
  assert.throws(() => normalizeRegistrableDomain('www.shynolaser.com'));
});

test('domainPurchaseSchema rejects domains outside the registrar TLD allowlist', () => {
  const parsed = domainPurchaseSchema.safeParse({ domain: 'shynolaser.com' });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.domain, 'shynolaser.com');

  const invalid = domainPurchaseSchema.safeParse({ domain: 'shynolaser.io' });
  assert.equal(invalid.success, false);
});
