import { AppError } from '../errors';
import type { PaidPackageModuleId, PaidPackagePlan } from './package-payment';

export const COMMERCIAL_PRICING_VERSION = 'public-estimate-mxn-2026-07-v1';

/**
 * Módulos anunciados para Pro que todavía no forman parte del alcance
 * contratable del lanzamiento inicial. Mantener la compuerta en dominio evita
 * que una petición manipulada pueda saltarse el estado visual del configurador.
 */
export const UPCOMING_PAID_PACKAGE_MODULES = ['cart', 'data'] as const satisfies readonly PaidPackageModuleId[];
export const ASTRAMUSES_COMMERCIAL_AVAILABLE = false;

export function isPaidPackageModuleAvailable(module: PaidPackageModuleId): boolean {
  return !UPCOMING_PAID_PACKAGE_MODULES.some((upcoming) => upcoming === module);
}

export function normalizeCommercialMarketing(marketing: boolean): false {
  if (marketing) {
    throw new AppError(
      'validation_error',
      'AstraMuses estará disponible próximamente y no forma parte de las ofertas actuales.',
    );
  }
  return false;
}

/**
 * El pago de implementación se fracciona en 4 fases del 25% cada una,
 * alineadas 1 a 1 con las transiciones de `lmw_starter_work_orders`:
 * arranque (awaiting_provisioning -> in_build), revisión del cliente
 * (in_build -> client_review), listo para publicar (client_review ->
 * ready_to_publish) y publicación (ready_to_publish -> live). Adelantar el
 * pago de una fase posterior es opcional para el cliente, nunca obligatorio.
 */
export const IMPLEMENTATION_PAYMENT_PHASE_PERCENTAGES = [25, 25, 25, 25] as const;
export const IMPLEMENTATION_PAYMENT_PHASE_COUNT = IMPLEMENTATION_PAYMENT_PHASE_PERCENTAGES.length;
/**
 * Mercado Pago rejects checkout amounts below MXN 10. Keep every phase above
 * that provider floor instead of creating an accepted offer that can never be
 * paid through the configured checkout.
 */
export const IMPLEMENTATION_MINIMUM_PHASE_AMOUNT_CENTS = 1_000;
export const IMPLEMENTATION_MINIMUM_TOTAL_AMOUNT_CENTS =
  IMPLEMENTATION_MINIMUM_PHASE_AMOUNT_CENTS * IMPLEMENTATION_PAYMENT_PHASE_COUNT;

export interface ImplementationPaymentPhaseSplit {
  phase: 1 | 2 | 3 | 4;
  amountCents: number;
}

/**
 * Divide el importe total de implementación en 4 fases del 25%. La última
 * fase absorbe el residuo del redondeo para que la suma sea exacta al total;
 * si ese residuo deja una fase por debajo del mínimo del proveedor, se
 * redistribuye desde las fases que tienen céntimos disponibles.
 */
export function splitImplementationIntoPhases(totalCents: number): ImplementationPaymentPhaseSplit[] {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < IMPLEMENTATION_MINIMUM_TOTAL_AMOUNT_CENTS
  ) {
    throw new AppError(
      'validation_error',
      `La implementación debe sumar al menos MXN ${IMPLEMENTATION_MINIMUM_TOTAL_AMOUNT_CENTS / 100} para respetar el mínimo de cada fase.`,
    );
  }
  const shares: number[] = [];
  let allocated = 0;
  IMPLEMENTATION_PAYMENT_PHASE_PERCENTAGES.forEach((percentage, index) => {
    const isLast = index === IMPLEMENTATION_PAYMENT_PHASE_PERCENTAGES.length - 1;
    const share = isLast ? totalCents - allocated : Math.round((totalCents * percentage) / 100);
    allocated += share;
    shares.push(share);
  });
  let minimumDeficit = shares.reduce(
    (deficit, amountCents) =>
      deficit + Math.max(0, IMPLEMENTATION_MINIMUM_PHASE_AMOUNT_CENTS - amountCents),
    0,
  );
  for (let index = 0; index < shares.length - 1 && minimumDeficit > 0; index += 1) {
    const current = shares[index];
    const lastIndex = shares.length - 1;
    const last = shares[lastIndex];
    if (current === undefined || last === undefined) {
      throw new AppError('internal_error', 'No se pudo distribuir el importe de implementación.');
    }
    const transferable = Math.max(0, current - IMPLEMENTATION_MINIMUM_PHASE_AMOUNT_CENTS);
    const transfer = Math.min(transferable, minimumDeficit);
    shares[index] = current - transfer;
    shares[lastIndex] = last + transfer;
    minimumDeficit -= transfer;
  }
  if (shares.some((amountCents) => amountCents < IMPLEMENTATION_MINIMUM_PHASE_AMOUNT_CENTS)) {
    throw new AppError(
      'validation_error',
      'Cada fase de implementación debe respetar el mínimo de pago del proveedor.',
    );
  }
  return shares.map((amountCents, index) => ({
    phase: (index + 1) as 1 | 2 | 3 | 4,
    amountCents,
  }));
}

export const COMMERCIAL_PACKAGE_PRICING_CENTS = {
  implementation: {
    starterOneComplement: 790_000,
    starterTwoComplements: 1_090_000,
    proBase: 1_490_000,
    proWithCartOrOptimization: 1_990_000,
    proFull: 2_490_000,
  },
  monthly: {
    // Mantenimiento base: cambios ligeros y actualizaciones mensuales.
    maintenanceFrom: 29_900,
    // Mantenimiento avanzado: cambios semanales, mayor flexibilidad.
    operationalMaintenanceFrom: 59_900,
    // Add-on de seguridad: revisiones periódicas, auditorías y pruebas diarias de salud.
    securityAddOnFrom: 69_900,
    astramusesStaticFrom: 10_000,
  },
} as const;

/**
 * Plan de mantenimiento ya decidido (a diferencia de `'later'`, que solo
 * existe en el intake mientras el cliente no ha elegido). Estos tres valores
 * son los únicos que puede tener una mensualidad real: sin mantenimiento,
 * básico o avanzado.
 */
export const MAINTENANCE_PLAN_TIERS = ['none', 'basic', 'advanced'] as const;
export type MaintenancePlanTier = (typeof MAINTENANCE_PLAN_TIERS)[number];

/** Monto mensual congelado para cada plan real de mantenimiento. */
export function maintenancePlanTierAmountCents(tier: MaintenancePlanTier): number {
  switch (tier) {
    case 'none':
      return 0;
    case 'basic':
      return COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.maintenanceFrom;
    case 'advanced':
      return COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.operationalMaintenanceFrom;
  }
}

export interface CommercialPackageEstimate {
  implementationAmountCents: number;
  implementationLabel: string;
  maintenanceAmountCents: number;
  operationalMaintenanceAmountCents: number;
  securityAddOnAmountCents: number;
  astramusesAmountCents: number;
  estimatedMonthlyAmountCents: number;
  pricingVersion: typeof COMMERCIAL_PRICING_VERSION;
}

export function normalizePaidPackageModules(
  plan: PaidPackagePlan,
  input: PaidPackageModuleId[],
): PaidPackageModuleId[] {
  const modules = [...new Set(input)];
  if (!modules.includes('landing') || !modules.includes('panel')) {
    throw new AppError(
      'validation_error',
      'Landing y Panel son obligatorios en los paquetes pagados.',
    );
  }
  const unavailable = modules.filter((module) => !isPaidPackageModuleAvailable(module));
  if (unavailable.length > 0) {
    throw new AppError(
      'validation_error',
      'Carrito y Optimization estarán disponibles próximamente como ampliaciones de Pro.',
    );
  }
  if (plan === 'starter') {
    if (modules.includes('cart') || modules.includes('data')) {
      throw new AppError('validation_error', 'Carrito y Optimization requieren el plan Pro.');
    }
    if (paidComplements(modules).length > 2) {
      throw new AppError('validation_error', 'Starter permite hasta dos complementos.');
    }
  }
  return modules;
}

export function estimateCommercialPackage(input: {
  plan: PaidPackagePlan;
  modules: PaidPackageModuleId[];
  marketing: boolean;
}): CommercialPackageEstimate {
  const modules = normalizePaidPackageModules(input.plan, input.modules);
  normalizeCommercialMarketing(input.marketing);
  const complements = paidComplements(modules);
  const hasCart = modules.includes('cart');
  const hasOptimization = modules.includes('data');
  const implementationAmountCents =
    input.plan === 'starter'
      ? complements.length >= 2
        ? COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.starterTwoComplements
        : COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.starterOneComplement
      : hasCart && hasOptimization
        ? COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.proFull
        : hasCart || hasOptimization
          ? COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.proWithCartOrOptimization
          : COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.proBase;
  const implementationLabel =
    input.plan === 'starter'
      ? complements.length >= 2
        ? 'Starter · 2 complementos'
        : complements.length === 1
          ? 'Starter · 1 complemento'
          : 'Starter · base mínima'
      : hasCart && hasOptimization
        ? 'Pro · comercio + optimización'
        : hasCart
          ? 'Pro · comercio'
          : hasOptimization
            ? 'Pro · optimización'
            : 'Pro base';
  const astramusesAmountCents = 0;
  const maintenanceAmountCents = COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.maintenanceFrom;

  return {
    implementationAmountCents,
    implementationLabel,
    maintenanceAmountCents,
    operationalMaintenanceAmountCents:
      COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.operationalMaintenanceFrom,
    securityAddOnAmountCents: COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.securityAddOnFrom,
    astramusesAmountCents,
    estimatedMonthlyAmountCents: maintenanceAmountCents + astramusesAmountCents,
    pricingVersion: COMMERCIAL_PRICING_VERSION,
  };
}

function paidComplements(modules: PaidPackageModuleId[]): PaidPackageModuleId[] {
  return modules.filter((module) => module !== 'landing' && module !== 'panel');
}
