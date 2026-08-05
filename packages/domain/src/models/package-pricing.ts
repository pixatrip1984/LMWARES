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

export const COMMERCIAL_PACKAGE_PRICING_CENTS = {
  implementation: {
    starterOneComplement: 790_000,
    starterTwoComplements: 1_090_000,
    proBase: 1_490_000,
    proWithCartOrOptimization: 1_990_000,
    proFull: 2_490_000,
  },
  monthly: {
    maintenanceFrom: 90_000,
    operationalMaintenanceFrom: 290_000,
    securityAddOnFrom: 190_000,
    astramusesStaticFrom: 10_000,
  },
} as const;

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
