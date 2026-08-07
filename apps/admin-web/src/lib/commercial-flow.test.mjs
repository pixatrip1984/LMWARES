import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStarterPublicationBlockers,
  isValidStarterPublicationUrl,
} from './commercial-flow.ts';

function acceptedOffer(overrides = {}) {
  return {
    id: 'offer-1',
    intakeId: 'intake-1',
    userId: 'user-1',
    version: 1,
    status: 'accepted',
    plan: 'starter',
    modules: ['landing', 'panel'],
    marketing: false,
    implementationAmountCents: 400000,
    monthlyAmountCents: 0,
    maintenancePlanSelected: 'none',
    currency: 'MXN',
    scopeSummary: 'Resumen suficientemente largo para la prueba.',
    implementationDescription: 'Implementación suficientemente larga para la prueba.',
    recurringDescription: 'Recurrencia suficientemente larga para la prueba.',
    maintenanceStartPolicy: 'on_go_live',
    termsVersion: 'terms-v1',
    termsSnapshot: {},
    validUntil: '2026-08-31T00:00:00.000Z',
    issuedBy: 'admin@lmwares.com',
    issuedAt: '2026-08-01T00:00:00.000Z',
    acceptedAt: '2026-08-02T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

function phase(phaseNumber, status) {
  return {
    id: `order-${phaseNumber}`,
    purpose: 'implementation',
    commercialOfferId: 'offer-1',
    intakeId: 'intake-1',
    userId: 'user-1',
    status,
    phase: phaseNumber,
    amountCents: 100000,
    currency: 'MXN',
    orderSnapshot: {},
    externalReference: `ref-${phaseNumber}`,
    provider: 'mercado_pago',
    providerPreferenceId: null,
    providerPaymentId: status === 'paid' ? `pay-${phaseNumber}` : null,
    checkoutUrl: null,
    checkoutExpiresAt: null,
    lastProviderStatus: null,
    paymentReviewRequired: false,
    paidAt: status === 'paid' ? '2026-08-03T00:00:00.000Z' : null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };
}

function workOrder(overrides = {}) {
  return {
    id: 'work-1',
    billingOrderId: 'order-1',
    intakeId: 'intake-1',
    commercialOfferId: 'offer-1',
    userId: 'user-1',
    projectId: 'oracle-proj',
    status: 'ready_to_publish',
    workSnapshot: {},
    assignedBy: 'admin@lmwares.com',
    assignedAt: '2026-08-03T00:00:00.000Z',
    publishedUrl: null,
    publishedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

function subscription(status) {
  return {
    id: 'sub-1',
    workOrderId: 'work-1',
    intakeId: 'intake-1',
    commercialOfferId: 'offer-1',
    userId: 'user-1',
    status,
    amountCents: 250000,
    currency: 'MXN',
    frequency: 1,
    frequencyType: 'months',
    pricingVersion: 'offer-1:v1',
    subscriptionSnapshot: {},
    provider: 'mercado_pago',
    providerPreapprovalId: 'pre-1',
    authorizationUrl: 'https://mp.test/authorize',
    externalReference: 'lmw-maintenance:1',
    providerStatus: null,
    nextPaymentDate: null,
    lastAuthorizedPaymentId: null,
    lastAuthorizedPaymentStatus: null,
    authorizedAt: null,
    canceledAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };
}

test('accepts only https lmwares subdomains as starter publication URLs', () => {
  assert.equal(isValidStarterPublicationUrl('https://cliente.lmwares.com'), true);
  assert.equal(isValidStarterPublicationUrl('http://cliente.lmwares.com'), false);
  assert.equal(isValidStarterPublicationUrl('https://cliente.example.com'), false);
  assert.equal(isValidStarterPublicationUrl('https://user:pass@cliente.lmwares.com'), false);
});

test('flags missing phase 4, missing project and missing URL as publication blockers', () => {
  const blockers = buildStarterPublicationBlockers({
    acceptedOffer: acceptedOffer(),
    billingOrders: [phase(1, 'paid'), phase(2, 'paid'), phase(3, 'paid')],
    workOrder: workOrder({ projectId: null }),
    maintenanceSubscription: null,
    publicUrl: '',
  });

  assert.match(blockers.join('\n'), /Falta enlazar el proyecto interno de Oracle/);
  assert.match(blockers.join('\n'), /Falta registrar la fase 4 de implementación/);
  assert.match(blockers.join('\n'), /Falta capturar la URL pública inicial/);
});

test('requires an active subscription when maintenance is contracted', () => {
  const blockers = buildStarterPublicationBlockers({
    acceptedOffer: acceptedOffer({
      maintenancePlanSelected: 'advanced',
      monthlyAmountCents: 250000,
    }),
    billingOrders: [phase(1, 'paid'), phase(2, 'paid'), phase(3, 'paid'), phase(4, 'paid')],
    workOrder: workOrder(),
    maintenanceSubscription: subscription('pending_authorization'),
    publicUrl: 'https://cliente.lmwares.com',
  });

  assert.match(blockers.join('\n'), /el cliente aún no la autoriza/i);
});

test('returns no blockers when the publication gate is fully satisfied', () => {
  const blockers = buildStarterPublicationBlockers({
    acceptedOffer: acceptedOffer({
      maintenancePlanSelected: 'basic',
      monthlyAmountCents: 125000,
    }),
    billingOrders: [phase(1, 'paid'), phase(2, 'paid'), phase(3, 'paid'), phase(4, 'paid')],
    workOrder: workOrder(),
    maintenanceSubscription: subscription('active'),
    publicUrl: 'https://cliente.lmwares.com',
  });

  assert.deepEqual(blockers, []);
});
