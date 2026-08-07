import type {
  BillingOrder,
  CommercialOffer,
  MaintenanceSubscription,
  StarterWorkOrder,
} from '@starter/domain';

interface PublicationBlockerInput {
  acceptedOffer: CommercialOffer | null;
  billingOrders: BillingOrder[];
  workOrder: StarterWorkOrder | null;
  maintenanceSubscription: MaintenanceSubscription | null;
  publicUrl: string;
}

export function isValidStarterPublicationUrl(publicUrl: string): boolean {
  const trimmed = publicUrl.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.hostname.toLowerCase().endsWith('.lmwares.com')
    );
  } catch {
    return false;
  }
}

export function buildStarterPublicationBlockers({
  acceptedOffer,
  billingOrders,
  workOrder,
  maintenanceSubscription,
  publicUrl,
}: PublicationBlockerInput): string[] {
  const blockers: string[] = [];

  if (!acceptedOffer) {
    blockers.push('Falta una oferta comercial aceptada para este intake.');
  }

  if (!workOrder) {
    blockers.push('La fase 1 debe estar pagada para crear la orden de trabajo Starter.');
  } else {
    if (workOrder.status === 'canceled') {
      blockers.push('La orden de trabajo está cancelada y no puede publicarse.');
    }
    if (!workOrder.projectId) {
      blockers.push('Falta enlazar el proyecto interno de Oracle antes de poder publicar.');
    }
    if (workOrder.status !== 'ready_to_publish' && workOrder.status !== 'live') {
      blockers.push(
        'La orden de trabajo todavía no está marcada como lista para publicar.',
      );
    }
  }

  const phase4 = billingOrders.find((order) => order.phase === 4) ?? null;
  if (!phase4) {
    blockers.push('Falta registrar la fase 4 de implementación antes de publicar.');
  } else if (phase4.status !== 'paid') {
    blockers.push(
      `La fase 4 de implementación sigue ${phase4.status}; confirma ese pago antes de publicar.`,
    );
  }

  if (acceptedOffer) {
    if (acceptedOffer.maintenancePlanSelected === null) {
      blockers.push(
        'El cliente todavía no decide su mantenimiento; debe elegir none, basic o advanced antes de publicar.',
      );
    } else if (acceptedOffer.maintenancePlanSelected === 'none') {
      if (acceptedOffer.monthlyAmountCents !== 0) {
        blockers.push(
          'La oferta indica “sin mantenimiento”, pero el monto mensual no está en cero.',
        );
      }
    } else if (acceptedOffer.monthlyAmountCents <= 0) {
      blockers.push(
        'La oferta requiere mantenimiento, pero el monto mensual quedó inválido.',
      );
    } else if (!maintenanceSubscription) {
      blockers.push(
        'Falta crear la suscripción de mantenimiento y conseguir la autorización del cliente.',
      );
    } else if (maintenanceSubscription.status !== 'active') {
      blockers.push(subscriptionBlockerMessage(maintenanceSubscription.status));
    }
  }

  if (!publicUrl.trim()) {
    blockers.push('Falta capturar la URL pública inicial del sitio.');
  } else if (!isValidStarterPublicationUrl(publicUrl)) {
    blockers.push(
      'La URL pública inicial debe ser HTTPS y terminar en un subdominio .lmwares.com.',
    );
  }

  return unique(blockers);
}

function subscriptionBlockerMessage(status: MaintenanceSubscription['status']): string {
  switch (status) {
    case 'creating':
      return 'La suscripción de mantenimiento todavía se está preparando.';
    case 'creation_failed':
      return 'La suscripción de mantenimiento falló al crearse; reinténtala desde el flujo del cliente.';
    case 'pending_authorization':
      return 'La suscripción de mantenimiento existe, pero el cliente aún no la autoriza.';
    case 'payment_attention':
      return 'La suscripción de mantenimiento requiere revisión de cobro antes de publicar.';
    case 'paused':
      return 'La suscripción de mantenimiento está pausada y debe reactivarse antes de publicar.';
    case 'canceled':
      return 'La suscripción de mantenimiento fue cancelada; se necesita una activa para publicar.';
    case 'disputed':
      return 'La suscripción de mantenimiento está en disputa y bloquea la publicación.';
    case 'active':
      return 'La suscripción está activa.';
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
