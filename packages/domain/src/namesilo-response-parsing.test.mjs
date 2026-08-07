import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asArray,
  domainNameOf,
  mapCheckRegistrationReply,
  priceCentsOf,
} from './namesilo-response-parsing.ts';

test('asArray normalizes a single object, a single string and undefined into arrays', () => {
  assert.deepEqual(asArray(undefined), []);
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray('shynolaser.com'), ['shynolaser.com']);
  assert.deepEqual(asArray(['a', 'b']), ['a', 'b']);
  assert.deepEqual(asArray({ domain: 'shynolaser.com' }), ['shynolaser.com']);
  assert.deepEqual(asArray({ domain: ['a.com', 'b.com'] }), ['a.com', 'b.com']);
});

test('domainNameOf reads plain strings and XML-ish text/domain/value wrappers', () => {
  assert.equal(domainNameOf('Shynolaser.COM'), 'shynolaser.com');
  assert.equal(domainNameOf({ '#text': 'shynolaser.com' }), 'shynolaser.com');
  assert.equal(domainNameOf({ domain: 'shynolaser.com' }), 'shynolaser.com');
  assert.equal(domainNameOf({ value: 'shynolaser.com' }), 'shynolaser.com');
  assert.equal(domainNameOf(42), '');
});

test('priceCentsOf parses decimal USD prices into integer cents', () => {
  assert.equal(priceCentsOf({ price: '9.99' }), 999);
  assert.equal(priceCentsOf({ '@price': '12.5' }), 1250);
  assert.equal(priceCentsOf({}), null);
  assert.equal(priceCentsOf({ price: 'not-a-number' }), null);
  assert.equal(priceCentsOf({ price: '-5' }), null);
});

test('mapCheckRegistrationReply marks queried domains as available/unavailable/invalid', () => {
  const reply = {
    available: { domain: [{ '#text': 'shynolaser.com', price: '9.99' }] },
    unavailable: { domain: 'shynolaser.mx' },
    invalid: { domain: [] },
  };

  const results = mapCheckRegistrationReply(
    ['shynolaser.com', 'shynolaser.mx', 'shynolaser.net'],
    reply,
  );

  assert.deepEqual(results, [
    { domain: 'shynolaser.com', available: true, priceCents: 999 },
    { domain: 'shynolaser.mx', available: false, priceCents: null },
    // Un dominio ausente de las tres listas nunca se trata como disponible.
    { domain: 'shynolaser.net', available: false, priceCents: null },
  ]);
});

test('mapCheckRegistrationReply treats invalid domains as unavailable without a price', () => {
  const reply = {
    available: { domain: [{ '#text': 'shynolaser.com', price: '9.99' }] },
    invalid: { domain: 'bad_domain..com' },
  };

  const results = mapCheckRegistrationReply(['bad_domain..com'], reply);
  assert.deepEqual(results, [{ domain: 'bad_domain..com', available: false, priceCents: null }]);
});
