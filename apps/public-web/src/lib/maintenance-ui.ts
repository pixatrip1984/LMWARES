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
  if (!status) return 'Elige tu plan de mantenimiento';
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
    return 'Mercado Pago rechazó o no completó la autorización. Puedes reintentar con "Abrir Mercado Pago".';
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

export function maintenanceTierLabel(plan: 'none' | 'basic' | 'advanced'): { name: string; description: string } {
  const labels: Record<'none' | 'basic' | 'advanced', { name: string; description: string }> = {
    none: {
      name: 'Sin mantenimiento',
      description: 'Conservas la versión entregada como definitiva; el siguiente paso es indexarla en tu dominio.',
    },
    basic: {
      name: 'Mantenimiento básico',
      description: 'Cambios ligeros y actualizaciones mensuales.',
    },
    advanced: {
      name: 'Mantenimiento avanzado',
      description: 'Cambios semanales y mayor flexibilidad.',
    },
  };
  return labels[plan];
}

export function maintenancePresentation(status: MaintenanceStatus | null, planAlreadyDecided: boolean) {
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
        description: 'Mercado Pago rechazó o no pudo completar la autorización del cobro. Puedes reintentarlo con el mismo medio de pago u otro distinto.',
        projectMessage: 'Usa "Abrir Mercado Pago" para reintentar la autorización antes de continuar con el mantenimiento.',
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
      // El cliente ya había decidido su plan (en el configurador o justo
      // antes en esta misma pantalla): esto no es una decisión nueva, es
      // confirmar/activar lo ya acordado.
      if (planAlreadyDecided) {
        return {
          heading: 'Confirma tu mantenimiento',
          description: 'Este es el plan de mantenimiento que ya habías acordado. Autorízalo con Mercado Pago para activarlo; el proyecto puede publicarse en cuanto lo confirmes.',
          projectMessage: 'La publicación queda a cargo de LMWares en cuanto autorices esta mensualidad ya acordada.',
        };
      }
      return {
        heading: 'Elige tu plan de mantenimiento',
        description: 'El proyecto ya está construido y puede publicarse con o sin mantenimiento. Si eliges un plan, así se activará; si prefieres conservar esta versión como definitiva, puedes continuar sin contratarlo.',
        projectMessage: 'La publicación queda a cargo de LMWares en cuanto confirmes tu decisión (con o sin mantenimiento).',
      };
  }
}
