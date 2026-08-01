import type { CommercialOffer } from '@starter/domain';

export function publicCommercialOffer(offer: CommercialOffer) {
  return {
    id: offer.id,
    intakeId: offer.intakeId,
    version: offer.version,
    status: offer.status,
    plan: offer.plan,
    modules: offer.modules,
    marketing: offer.marketing,
    implementationAmountCents: offer.implementationAmountCents,
    monthlyAmountCents: offer.monthlyAmountCents,
    currency: offer.currency,
    scopeSummary: offer.scopeSummary,
    implementationDescription: offer.implementationDescription,
    recurringDescription: offer.recurringDescription,
    maintenanceStartPolicy: offer.maintenanceStartPolicy,
    termsVersion: offer.termsVersion,
    terms: {
      implementationPayment: metadataString(offer.termsSnapshot, 'implementationPayment'),
      recurringStart: metadataString(offer.termsSnapshot, 'recurringStart'),
      initialHosting: metadataString(offer.termsSnapshot, 'initialHosting'),
      cancellation: metadataString(offer.termsSnapshot, 'cancellation'),
      support: metadataString(offer.termsSnapshot, 'support'),
    },
    validUntil: offer.validUntil,
    issuedAt: offer.issuedAt,
    acceptedAt: offer.acceptedAt,
    updatedAt: offer.updatedAt,
  };
}

function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}
