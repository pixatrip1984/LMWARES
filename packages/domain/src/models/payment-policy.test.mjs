import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutBlocked, decidePaymentPolicy } from './payment-policy.ts';

test('bloquea el checkout de una propuesta ya pagada', () => {
  assert.equal(checkoutBlocked({ status: 'paid', paymentReviewRequired: false }), true);
  assert.equal(checkoutBlocked({ status: 'payment_pending', paymentReviewRequired: false }), false);
});

test('el primer pago aprobado se convierte en canónico', () => {
  assert.deepEqual(
    decidePaymentPolicy({
      providerStatus: 'approved',
      canonicalPaymentId: null,
      incomingPaymentId: 'payment-1',
    }),
    {
      affectsProposal: true,
      disposition: 'accepted',
      proposalStatus: 'paid',
      reviewRequired: false,
    },
  );
});

test('repetir el mismo pago aprobado es idempotente', () => {
  assert.deepEqual(
    decidePaymentPolicy({
      providerStatus: 'approved',
      canonicalPaymentId: 'payment-1',
      incomingPaymentId: 'payment-1',
    }),
    {
      affectsProposal: true,
      disposition: 'accepted',
      proposalStatus: 'paid',
      reviewRequired: false,
    },
  );
});

test('un segundo pago aprobado no sustituye al canónico', () => {
  assert.deepEqual(
    decidePaymentPolicy({
      providerStatus: 'approved',
      canonicalPaymentId: 'payment-1',
      incomingPaymentId: 'payment-2',
    }),
    {
      affectsProposal: false,
      disposition: 'duplicate_review',
      proposalStatus: 'paid',
      reviewRequired: true,
    },
  );
});

test('un reembolso sólo afecta la propuesta cuando pertenece al pago canónico', () => {
  const canonical = decidePaymentPolicy({
    providerStatus: 'refunded',
    canonicalPaymentId: 'payment-1',
    incomingPaymentId: 'payment-1',
  });
  const duplicate = decidePaymentPolicy({
    providerStatus: 'refunded',
    canonicalPaymentId: 'payment-1',
    incomingPaymentId: 'payment-2',
  });

  assert.equal(canonical.affectsProposal, true);
  assert.equal(canonical.disposition, 'refunded');
  assert.equal(duplicate.affectsProposal, false);
  assert.equal(duplicate.disposition, 'refunded');
});

test('los estados no aprobados no sustituyen un pago canónico', () => {
  for (const providerStatus of ['rejected', 'cancelled', 'canceled', 'pending']) {
    const decision = decidePaymentPolicy({
      providerStatus,
      canonicalPaymentId: 'payment-1',
      incomingPaymentId: 'payment-2',
    });
    assert.equal(decision.affectsProposal, false);
    assert.equal(decision.reviewRequired, false);
    assert.equal(decision.proposalStatus, providerStatus === 'pending' ? 'payment_pending' : 'payment_failed');
    assert.equal(decision.disposition, providerStatus === 'pending' ? 'pending' : 'failed');
  }
});

test('un cargo en disputa conserva la revisión del pago original', () => {
  assert.deepEqual(
    decidePaymentPolicy({
      providerStatus: 'charged_back',
      canonicalPaymentId: 'payment-1',
      incomingPaymentId: 'payment-1',
    }),
    {
      affectsProposal: true,
      disposition: 'charged_back',
      proposalStatus: 'payment_failed',
      reviewRequired: false,
    },
  );
});
