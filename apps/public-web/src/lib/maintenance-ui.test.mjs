import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./maintenance-ui.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  maintenanceActionLabel,
  maintenancePresentation,
  maintenanceTierLabel,
  reconciliationMessage,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('active maintenance never claims that publication already happened', () => {
  const presentation = maintenancePresentation('active');
  assert.equal(presentation.heading, 'Mantenimiento autorizado');
  assert.match(presentation.description, /publicación por separado/);
  assert.match(
    reconciliationMessage('active', 'authorized'),
    /publicación se confirma por separado/,
  );
});

test('every non-happy maintenance state has a precise account action', () => {
  assert.equal(maintenanceActionLabel(null), 'Elige tu plan de mantenimiento');
  assert.equal(maintenanceActionLabel(null, true), 'Activar mantenimiento');
  assert.equal(maintenanceActionLabel('payment_attention'), 'Resolver mensualidad');
  assert.equal(maintenanceActionLabel('paused'), 'Revisar mensualidad pausada');
  assert.equal(maintenanceActionLabel('disputed'), 'Revisar cobro en aclaración');
  assert.equal(maintenanceActionLabel('canceled'), 'Ver mensualidad cancelada');
});

test('canceled maintenance is not presented as a fresh authorization', () => {
  const presentation = maintenancePresentation('canceled');
  assert.equal(presentation.heading, 'Mantenimiento cancelado');
  assert.match(reconciliationMessage('canceled', 'canceled'), /no se programarán cobros futuros/);
});

test('none maintenance is presented as a one-time delivery', () => {
  const presentation = maintenancePresentation(null, true, 'none');
  assert.equal(presentation.heading, 'Sin mantenimiento mensual');
  assert.match(presentation.description, /pago único/);
  assert.match(presentation.projectMessage, /publicación/);
});

test('maintenance tiers explain the domain entitlement precisely', () => {
  assert.match(maintenanceTierLabel('none').description, /Tú compras tu propio dominio/);
  assert.match(maintenanceTierLabel('basic').description, /Incluye dominio.*mensuales/);
  assert.match(maintenanceTierLabel('advanced').description, /Incluye dominio.*semanales/);
});
