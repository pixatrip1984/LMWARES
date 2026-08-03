import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maintenanceActionLabel,
  maintenancePresentation,
  reconciliationMessage,
} from './maintenance-ui.ts';

test('active maintenance never claims that publication already happened', () => {
  const presentation = maintenancePresentation('active');
  assert.equal(presentation.heading, 'Mantenimiento autorizado');
  assert.match(presentation.description, /publicación por separado/);
  assert.match(reconciliationMessage('active', 'authorized'), /publicación se confirma por separado/);
});

test('every non-happy maintenance state has a precise account action', () => {
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
