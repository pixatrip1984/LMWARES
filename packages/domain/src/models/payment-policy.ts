export type PaymentAttemptDisposition =
  | 'pending'
  | 'failed'
  | 'accepted'
  | 'duplicate_review'
  | 'refunded'
  | 'charged_back';

export type ReconciledProposalStatus = 'payment_pending' | 'payment_failed' | 'paid';

export interface PaymentPolicyDecision {
  affectsProposal: boolean;
  disposition: PaymentAttemptDisposition;
  proposalStatus: ReconciledProposalStatus;
  reviewRequired: boolean;
}

export function decidePaymentPolicy(input: {
  providerStatus: string;
  canonicalPaymentId: string | null;
  incomingPaymentId: string;
}): PaymentPolicyDecision {
  const affectsProposal =
    input.canonicalPaymentId === null || input.canonicalPaymentId === input.incomingPaymentId;

  if (input.providerStatus === 'approved') {
    const reviewRequired =
      input.canonicalPaymentId !== null && input.canonicalPaymentId !== input.incomingPaymentId;
    return {
      affectsProposal: !reviewRequired,
      disposition: reviewRequired ? 'duplicate_review' : 'accepted',
      proposalStatus: 'paid',
      reviewRequired,
    };
  }

  if (input.providerStatus === 'refunded') {
    return {
      affectsProposal,
      disposition: 'refunded',
      proposalStatus: 'payment_failed',
      reviewRequired: false,
    };
  }

  if (input.providerStatus === 'charged_back') {
    return {
      affectsProposal,
      disposition: 'charged_back',
      proposalStatus: 'payment_failed',
      reviewRequired: false,
    };
  }

  if (['rejected', 'cancelled', 'canceled'].includes(input.providerStatus)) {
    return {
      affectsProposal,
      disposition: 'failed',
      proposalStatus: 'payment_failed',
      reviewRequired: false,
    };
  }

  return {
    affectsProposal,
    disposition: 'pending',
    proposalStatus: 'payment_pending',
    reviewRequired: false,
  };
}

export function checkoutBlocked(input: {
  status: string;
  paymentReviewRequired: boolean;
}): boolean {
  return input.status === 'paid' || input.paymentReviewRequired;
}
