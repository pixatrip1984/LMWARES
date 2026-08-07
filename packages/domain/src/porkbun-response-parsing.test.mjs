import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRecord,
  normalizeDomain,
  normalizeSld,
  normalizeTld,
  priceCentsOf,
} from './porkbun-response-parsing.ts';

test('priceCentsOf parses Porkbun decimal USD price strings into integer cents', () => {
  assert.equal(priceCentsOf('9.98'), 998);
  assert.equal(priceCentsOf('12.5'), 1250);
  assert.equal(priceCentsOf(undefined), null);
  assert.equal(priceCentsOf(''), null);
  assert.equal(priceCentsOf('not-a-number'), null);
  assert.equal(priceCentsOf('-5'), null);
});

test('isRecord distinguishes plain objects from arrays, null and primitives', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
  assert.equal(isRecord(42), false);
});

test('normalizeSld accepts alnum/hyphen labels and rejects dots, spaces and empty input', () => {
  assert.equal(normalizeSld('ShynoLaser'), 'shynolaser');
  assert.equal(normalizeSld(' my-brand-2 '), 'my-brand-2');
  assert.throws(() => normalizeSld('bad sld'), /letras, números y guiones/);
  assert.throws(() => normalizeSld('shyno.laser'), /letras, números y guiones/);
  assert.throws(() => normalizeSld(''), /letras, números y guiones/);
  assert.throws(() => normalizeSld('-leading'), /letras, números y guiones/);
});

test('normalizeTld strips a leading dot and lowercases, rejecting unsupported shapes', () => {
  assert.equal(normalizeTld('.COM'), 'com');
  assert.equal(normalizeTld('com.mx'), 'com.mx');
  assert.equal(normalizeTld(' Net '), 'net');
  assert.throws(() => normalizeTld('1nvalid'), /TLD no soportado/);
});

test('normalizeDomain requires at least two labels and rejects malformed hosts', () => {
  assert.equal(normalizeDomain('ShynoLaser.COM'), 'shynolaser.com');
  assert.throws(() => normalizeDomain('shynolaser'), /formato válido/);
  assert.throws(() => normalizeDomain('bad domain.com'), /formato válido/);
});
