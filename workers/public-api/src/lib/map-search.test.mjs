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
const {
  broadenMapSearchQuery,
  mapNominatimResults,
  mapPhotonResults,
  normalizeMapCoordinate,
  normalizeMapSearchQuery,
} = await import(moduleUrl);

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

test('normalizes bounded coordinates used by map bias and reverse lookup', () => {
  assert.equal(normalizeMapCoordinate('25.66642', -90, 90), 25.66642);
  assert.equal(normalizeMapCoordinate('', -90, 90), null);
  assert.equal(normalizeMapCoordinate('91', -90, 90), null);
  assert.equal(normalizeMapCoordinate('not-a-number', -180, 180), null);
});

test('can broaden an address only when its exact house number is missing', () => {
  assert.equal(
    broadenMapSearchQuery('Girasol 309 Jardines de Villa Juárez'),
    'Girasol Jardines de Villa Juárez',
  );
  assert.equal(broadenMapSearchQuery('Museo MARCO Monterrey'), 'Museo MARCO Monterrey');
});

test('maps Photon suggestions into safe display locations', () => {
  const results = mapPhotonResults({
    features: [
      {
        geometry: { coordinates: [-100.31044, 25.66642] },
        properties: {
          name: 'Museo MARCO',
          street: 'Zuazua',
          housenumber: '800',
          district: 'Centro',
          city: 'Monterrey',
          state: 'Nuevo León',
          postcode: '64000',
          country: 'México',
          osm_key: 'tourism',
          osm_value: 'museum',
          osm_type: 'N',
          osm_id: 123,
        },
      },
      {
        geometry: { coordinates: [-100.31044, 25.66642] },
        properties: { name: 'Duplicado' },
      },
      {
        geometry: { coordinates: [-181, 25] },
        properties: { name: 'Fuera de rango' },
      },
    ],
  });

  assert.deepEqual(results, [{
    id: 'n-123',
    address: 'Museo MARCO, Zuazua 800, Centro, Monterrey, Nuevo León, 64000, México',
    latitude: 25.66642,
    longitude: -100.31044,
    category: 'tourism',
    type: 'museum',
  }]);
});
