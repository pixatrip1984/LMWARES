import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./map-search.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { mapNominatimResults, normalizeMapSearchQuery } = await import(moduleUrl);

test('normalizes an explicit map search without creating autocomplete requests', () => {
  assert.equal(
    normalizeMapSearchQuery('  Museo   MARCO,   Monterrey  '),
    'Museo MARCO, Monterrey',
  );
  assert.equal(normalizeMapSearchQuery('x'.repeat(200)).length, 160);
});

test('keeps only safe, unique and bounded Nominatim results', () => {
  const results = mapNominatimResults([
    {
      place_id: 1,
      osm_type: 'node',
      osm_id: 123,
      display_name: 'Museo MARCO, Monterrey, Nuevo León, México',
      lat: '25.666420',
      lon: '-100.310440',
      category: 'tourism',
      type: 'museum',
    },
    {
      place_id: 2,
      display_name: 'Duplicado',
      lat: '25.666420',
      lon: '-100.310440',
    },
    {
      place_id: 3,
      display_name: '<script>alert(1)</script>',
      lat: '999',
      lon: '-100',
    },
  ]);

  assert.deepEqual(results, [{
    id: 'node-123',
    address: 'Museo MARCO, Monterrey, Nuevo León, México',
    latitude: 25.66642,
    longitude: -100.31044,
    category: 'tourism',
    type: 'museum',
  }]);
});
