export type MaintenanceStatus =
  | 'creating'
  | 'creation_failed'
  | 'pending_authorization'
  | 'active'
  | 'payment_attention'
  | 'paused'
  | 'canceled'
  | 'disputed';

export function maintenanceActionLabel(status: MaintenanceStatus | null): string {
  if (!status) return 'Autorizar mensualidad para publicar';
  const labels: Record<MaintenanceStatus, string> = {
    creating: 'Ver mensualidad en preparación',
    creation_failed: 'Reintentar autorización mensual',
    pending_authorization: 'Continuar autorización mensual',
    active: 'Administrar mensualidad activa',
    payment_attention: 'Resolver mensualidad',
    paused: 'Revisar mensualidad pausada',
    canceled: 'Ver mensualidad cancelada',
    disputed: 'Revisar cobro en aclaración',
  };
  return labels[status];
}

export function reconciliationMessage(status: MaintenanceStatus, providerStatus: string | null): string {
  if (status === 'active') {
    return 'Mensualidad activa. LMWares ya puede completar la publicación; la publicación se confirma por separado.';
  }
  if (status === 'payment_attention') {
    return 'Mercado Pago requiere atención para conservar el mantenimiento. Revisa el medio de pago.';
  }
  if (status === 'paused') {
    return 'La mensualidad está pausada. El sitio no se marcará como listo para mantenimiento hasta reactivarla.';
  }
  if (status === 'disputed') {
    return 'Hay una aclaración pendiente sobre un cobro. Contacta a soporte antes de continuar.';
  }
  if (status === 'canceled') {
    return 'La mensualidad está cancelada y no se programarán cobros futuros.';
  }
  return `Mercado Pago reporta: ${providerStatus ?? 'pendiente'}.`;
}

export function maintenancePresentation(status: MaintenanceStatus | null) {
  switch (status) {
    case 'active':
      return {
        heading: 'Mantenimiento autorizado',
        description: 'Mercado Pago confirmó la mensualidad. LMWares aún debe completar y registrar la publicación por separado.',
        projectMessage: 'La compuerta mensual está abierta; el operador puede completar la publicación y emitir el comprobante.',
      };
    case 'payment_attention':
      return {
        heading: 'Tu mensualidad requiere atención',
        description: 'Mercado Pago reportó un problema con el cobro programado.',
        projectMessage: 'Revisa el estado y el medio de pago antes de continuar con el mantenimiento.',
      };
    case 'paused':
      return {
        heading: 'Mantenimiento pausado',
        description: 'La autorización existe, pero Mercado Pago la mantiene en pausa.',
        projectMessage: 'La publicación y el mantenimiento permanecen separados hasta recuperar el estado activo.',
      };
    case 'disputed':
      return {
        heading: 'Cobro en aclaración',
        description: 'Hay una disputa asociada a la mensualidad.',
        projectMessage: 'LMWares conservará la evidencia y no asumirá que el mantenimiento está activo.',
      };
    case 'canceled':
      return {
        heading: 'Mantenimiento cancelado',
        description: 'Esta autorización ya no programará nuevos cobros.',
        projectMessage: 'La cancelación no revierte el trabajo ya entregado ni crea automáticamente otro contrato.',
      };
    default:
      return {
        heading: 'Autoriza la mensualidad para publicar',
        description: 'El proyecto ya fue construido. El mantenimiento comienza únicamente al completar esta autorización.',
        projectMessage: 'La publicación seguirá bloqueada hasta que Mercado Pago confirme una suscripción activa.',
      };
  }
}
