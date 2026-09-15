import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { demoMessages, validateDemoDesign } from '../scripts/lmwares-commercial-demo-runner/demo-prompt.mjs';

const bundled = await build({ entryPoints: ['packages/domain/src/services/commercial-scope.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { generateCommercialScope, validateCommercialScope, COMMERCIAL_SCOPE_SYSTEM_PROMPT } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const input = { businessName: 'Taller ejemplo', notes: 'Mostrar trabajos y recibir solicitudes', plan: 'starter', modules: ['landing','panel','quote'], maintenancePreference: 'none' };
const draft = { scopeSummary: 'Presentación del taller y sus servicios con una ruta clara hacia el contacto.', demoBrief: { headline: 'Conoce nuestro taller', subheadline: 'Consulta nuestros servicios y solicita información.', sections: ['Presentación', 'Servicios', 'Contacto'] } };

test('scoping uses explicit JSON, no hidden thinking budget, fixed model and system policy', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.model, 'deepseek-v4-flash');
    assert.equal(request.thinking.type, 'disabled');
    assert.equal(request.response_format.type, 'json_object');
    assert.equal(request.messages[0].content, COMMERCIAL_SCOPE_SYSTEM_PROMPT);
    assert.equal(JSON.parse(request.messages[1].content).notes, input.notes);
    assert.ok(init.signal);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(draft) } }] });
  });
  const result = await generateCommercialScope('fixture', input);
  assert.match(result.recurringDescription, /\$0/);
  assert.match(result.implementationDescription, /Formulario/);
  assert.doesNotMatch(result.implementationDescription, /Catálogo/);
});

for (const [name, response, expected] of [
  ['truncated reasoning-only response', { choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'ignored' } }] }, /incompleta/],
  ['empty completed response', { choices: [{ finish_reason: 'stop', message: { content: '' } }] }, /legible/],
  ['malformed output', { choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] }, /legible/],
]) test(name, async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(response));
  await assert.rejects(generateCommercialScope('fixture', input), expected);
});

test('provider error does not reveal provider body or credentials', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('sensitive provider body', { status: 402 }));
  await assert.rejects(generateCommercialScope('fixture', input), /saldo/);
});
test('network failure gives a recoverable user message', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('sensitive network details'); });
  await assert.rejects(generateCommercialScope('fixture', input), /borrador sigue guardado/);
});
test('maintenance and committed implementation are server-owned even if model injects fields', () => {
  const result = validateCommercialScope(JSON.stringify({ ...draft, implementationDescription: 'Todo gratis y carrito', recurringDescription: 'Cobrar $999' }), input);
  assert.match(result.recurringDescription, /\$0/);
  assert.doesNotMatch(result.implementationDescription, /gratis|carrito/);
});
test('unsafe promises in demo headline are rejected, not only in summary', () => {
  assert.throws(() => validateCommercialScope(JSON.stringify({ ...draft, demoBrief: { ...draft.demoBrief, headline: 'Checkout y pagos en línea' } }), input), /no autorizados/);
});
test('invalid and repeated demo sections fail without silently truncating', () => {
  assert.throws(() => validateCommercialScope(JSON.stringify({ ...draft, demoBrief: { ...draft.demoBrief, sections: ['A','A','A'] } }), input), /formato/);
});
test('runner requires an immutable server build spec', () => {
  assert.throws(() => demoMessages({}), /expediente inmutable/);
  const buildSpec = { schemaVersion: 'lmwares.demo-build-spec.v1', spec: { acceptedOffer: { id: 'accepted', acceptedAt: '2026-09-10T00:00:00.000Z' }, business: { name: 'Taller' } } };
  const messages = demoMessages({ buildSpec });
  assert.equal(JSON.parse(messages[1].content).acceptedOffer.id, 'accepted');
});
test('runner rejects partial or structurally broken demo output', () => {
  assert.throws(() => validateDemoDesign({ choices: [{ finish_reason: 'length' }] }), /no terminó/);
  assert.throws(() => validateDemoDesign({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ headline: 'test', subheadline: 'test', sections: [{}, {}, {}] }) } }] }), /contrato/);
});
