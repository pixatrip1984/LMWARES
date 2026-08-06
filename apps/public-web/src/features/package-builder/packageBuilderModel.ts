import {
  COMMERCIAL_PACKAGE_PRICING_CENTS,
  estimateCommercialPackage,
  isPaidPackageModuleAvailable,
  type PaidPackageModuleId,
  type PaidPackagePlan,
} from '@starter/domain';

export type PlanId = 'free' | 'starter' | 'pro';

export type PackageModuleId =
  | 'landing'
  | 'panel'
  | 'blog'
  | 'galleries'
  | 'catalog'
  | 'quote'
  | 'events'
  | 'docs'
  | 'cart'
  | 'data';

export type PackageModule = {
  id: PackageModuleId;
  name: string;
  eyebrow: string;
  description: string;
  tier: 'base' | 'starter' | 'pro';
  visual: string;
};

export type DraftImage = {
  id: string;
  name: string;
  size: number;
  type: string;
};

export type MaintenancePlanPreference = 'later' | 'none' | 'basic' | 'advanced';

export type PackageBrief = {
  contactName: string;
  contactPhone: string;
  businessName: string;
  businessSummary: string;
  siteGoal: string;
  stylePreference: string;
  referenceNotes: string;
  customDomainPreference: string;
  maintenancePlanPreference: MaintenancePlanPreference;
  maintenanceSecurityAddOn: boolean;
};

export type PackageDraft = {
  plan: PlanId;
  modules: PackageModuleId[];
  marketing: boolean;
  images: DraftImage[];
  brief: PackageBrief;
  updatedAt: string;
};

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];
export const FOUNDATION_MODULES: PackageModuleId[] = ['landing', 'panel'];
export const PRO_ONLY_MODULES: PackageModuleId[] = ['cart', 'data'];

export const PACKAGE_MODULES: PackageModule[] = [
  {
    id: 'landing',
    name: 'Sitio web',
    eyebrow: 'Base',
    description: 'Páginas dinámicas orientadas a presentar tu negocio y convertir visitas en clientes.',
    tier: 'base',
    visual: '/assets/package-builder/landing-consulting.webp',
  },
  {
    id: 'panel',
    name: 'Panel',
    eyebrow: 'Base',
    description: 'Controla contenido y actividad del sistema.',
    tier: 'base',
    visual: '/assets/package-builder/panel.webp',
  },
  {
    id: 'blog',
    name: 'Blog',
    eyebrow: 'Contenido',
    description: 'Publicaciones dentro de una estructura clara.',
    tier: 'starter',
    visual: '/assets/package-builder/blog-frontier-lab.webp',
  },
  {
    id: 'galleries',
    name: 'Galerías',
    eyebrow: 'Muestra',
    description: 'Colecciones visuales para proyectos y servicios.',
    tier: 'starter',
    visual: '/assets/package-builder/galleries-paintings.webp',
  },
  {
    id: 'catalog',
    name: 'Catálogo',
    eyebrow: 'Orden',
    description: 'Productos o servicios organizados y consultables.',
    tier: 'starter',
    visual: '/assets/package-builder/catalog.webp',
  },
  {
    id: 'quote',
    name: 'Formulario',
    eyebrow: 'Solicitud',
    description: 'Recibe datos, referencias y solicitudes con claridad.',
    tier: 'starter',
    visual: '/assets/package-builder/formulario.webp',
  },
  {
    id: 'events',
    name: 'Eventos',
    eyebrow: 'Agenda',
    description: 'Fechas, registros y actividad programada.',
    tier: 'starter',
    visual: '/assets/package-builder/events.webp',
  },
  {
    id: 'docs',
    name: 'Docs',
    eyebrow: 'Conocimiento',
    description: 'Información operativa y documentación navegable.',
    tier: 'starter',
    visual: '/assets/package-builder/docs.webp',
  },
  {
    id: 'cart',
    name: 'E-Commerce',
    eyebrow: 'Comercio',
    description: 'Selección, pedido y flujo comercial avanzado.',
    tier: 'pro',
    visual: '/assets/package-builder/cart-ecommerce.webp',
  },
  {
    id: 'data',
    name: 'AI Optimization',
    eyebrow: 'Evidencia',
    description: 'Ciclos de medición, decisión y mejora continua.',
    tier: 'pro',
    visual: '/assets/package-builder/optimization-model-router.webp',
  },
];

export const EMPTY_PACKAGE_BRIEF: PackageBrief = {
  contactName: '',
  contactPhone: '',
  businessName: '',
  businessSummary: '',
  siteGoal: '',
  stylePreference: '',
  referenceNotes: '',
  customDomainPreference: '',
  maintenancePlanPreference: 'later',
  maintenanceSecurityAddOn: false,
};

export const DEFAULT_DRAFT: PackageDraft = {
  plan: 'starter',
  modules: ['landing', 'panel', 'catalog', 'quote'],
  marketing: false,
  images: [],
  brief: EMPTY_PACKAGE_BRIEF,
  updatedAt: new Date(0).toISOString(),
};

export function isPackageBriefComplete(brief: PackageBrief): boolean {
  return (
    brief.contactName.trim().length > 0 &&
    brief.contactPhone.trim().length > 0 &&
    brief.businessName.trim().length > 0 &&
    brief.businessSummary.trim().length > 0 &&
    brief.siteGoal.trim().length > 0
  );
}

export const FREE_IMAGE_LIMIT = 5;
export const FREE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const PACKAGE_PRICING = {
  implementation: {
    free: 0,
    starterOneComplement:
      COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.starterOneComplement / 100,
    starterTwoComplements:
      COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.starterTwoComplements / 100,
    proBase: COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.proBase / 100,
    proWithCartOrOptimization:
      COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.proWithCartOrOptimization / 100,
    proFull: COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.proFull / 100,
  },
  monthly: {
    maintenanceFrom: COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.maintenanceFrom / 100,
    operationalMaintenanceFrom:
      COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.operationalMaintenanceFrom / 100,
    securityAddOnFrom: COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.securityAddOnFrom / 100,
    astramusesStaticFrom:
      COMMERCIAL_PACKAGE_PRICING_CENTS.monthly.astramusesStaticFrom / 100,
  },
} as const;

export type PackagePriceEstimate = {
  implementation: number;
  implementationLabel: string;
  maintenanceFrom: number;
  operationalMaintenanceFrom: number;
  securityAddOnFrom: number;
  astramusesMonthly: number;
  monthlyOptionalFrom: number;
};

const DRAFT_KEY = 'lmwares.package-draft.v1';

export function getRecommendedPlan(modules: PackageModuleId[], _marketing: boolean): PlanId {
  if (modules.some((moduleId) => PRO_ONLY_MODULES.includes(moduleId))) return 'pro';
  if (modules.length > 0) return 'starter';
  return 'free';
}

export function getPlanSeed(plan: PlanId): PackageModuleId[] {
  if (plan === 'free') return [];
  if (plan === 'pro') return ['landing', 'panel', 'catalog'];
  return ['landing', 'panel', 'catalog'];
}

export function getSelectedComplements(modules: PackageModuleId[]) {
  return modules.filter((moduleId) => !FOUNDATION_MODULES.includes(moduleId));
}

export function getPackageLabel(plan: PlanId, modules: PackageModuleId[]) {
  if (plan === 'free') return 'Landing Page · 5 imágenes';
  if (plan === 'pro') return 'Pro base · módulos disponibles';

  const complementCount = getSelectedComplements(modules).length;
  if (complementCount === 0) return 'Hasta 2 complementos incluidos';
  return `${complementCount} de 2 complementos ${complementCount === 1 ? 'seleccionado' : 'seleccionados'}`;
}

export function formatMxPrice(amount: number) {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);
}

export function estimatePackagePrice(draft: Pick<PackageDraft, 'plan' | 'modules' | 'marketing'>): PackagePriceEstimate {
  if (draft.plan === 'free') {
    return {
      implementation: PACKAGE_PRICING.implementation.free,
      implementationLabel: 'Free automatizado',
      maintenanceFrom: 0,
      operationalMaintenanceFrom: 0,
      securityAddOnFrom: 0,
      astramusesMonthly: 0,
      monthlyOptionalFrom: 0,
    };
  }
  const estimate = estimateCommercialPackage({
    plan: draft.plan as PaidPackagePlan,
    modules: draft.modules as PaidPackageModuleId[],
    marketing: draft.marketing,
  });

  return {
    implementation: estimate.implementationAmountCents / 100,
    implementationLabel: estimate.implementationLabel,
    maintenanceFrom: estimate.maintenanceAmountCents / 100,
    operationalMaintenanceFrom: estimate.operationalMaintenanceAmountCents / 100,
    securityAddOnFrom: estimate.securityAddOnAmountCents / 100,
    astramusesMonthly: estimate.astramusesAmountCents / 100,
    monthlyOptionalFrom: estimate.astramusesAmountCents / 100,
  };
}

export function togglePackageModule(
  current: PackageModuleId[],
  moduleId: PackageModuleId,
): { modules: PackageModuleId[]; message?: string } {
  if (!isPackageModuleAvailable(moduleId)) {
    return {
      modules: current,
      message: 'E-Commerce y AI Optimization estarán disponibles próximamente como ampliaciones de Pro.',
    };
  }
  const selected = new Set(current);
  const foundationSelected = FOUNDATION_MODULES.every((id) => selected.has(id));
  const hasComplements = current.some((id) => !FOUNDATION_MODULES.includes(id));

  if (FOUNDATION_MODULES.includes(moduleId)) {
    if (foundationSelected && hasComplements) {
      return {
        modules: current,
        message: 'Sitio web y Panel forman la base de los módulos seleccionados.',
      };
    }

    return {
      modules: foundationSelected ? [] : [...FOUNDATION_MODULES],
    };
  }

  if (selected.has(moduleId)) selected.delete(moduleId);
  else {
    selected.add(moduleId);
    FOUNDATION_MODULES.forEach((id) => selected.add(id));
  }

  return { modules: PACKAGE_MODULES.map(({ id }) => id).filter((id) => selected.has(id)) };
}

export function loadPackageDraft(): PackageDraft {
  if (typeof window === 'undefined') return DEFAULT_DRAFT;

  try {
    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (!stored) return DEFAULT_DRAFT;
    const parsed = JSON.parse(stored) as Partial<PackageDraft>;
    const validIds = new Set(PACKAGE_MODULES.map(({ id }) => id));
    const modules = Array.isArray(parsed.modules)
      ? parsed.modules.filter(
          (id): id is PackageModuleId =>
            validIds.has(id as PackageModuleId)
            && isPackageModuleAvailable(id as PackageModuleId),
        )
      : DEFAULT_DRAFT.modules;

    const plan = parsed.plan === 'free' || parsed.plan === 'starter' || parsed.plan === 'pro'
      ? parsed.plan
      : getRecommendedPlan(modules, false);
    const starterComplements = modules.filter(
      (id) => !FOUNDATION_MODULES.includes(id) && !PRO_ONLY_MODULES.includes(id),
    ).slice(0, 2);
    const normalizedModules = plan === 'free'
      ? []
      : plan === 'starter'
        ? [...FOUNDATION_MODULES, ...starterComplements]
        : modules;

    return {
      plan,
      modules: normalizedModules,
      marketing: false,
      // File objects cannot be restored from localStorage. Restoring only their
      // metadata would show stale images that the intake cannot actually upload.
      images: [],
      brief: normalizePackageBrief(parsed.brief),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : DEFAULT_DRAFT.updatedAt,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function normalizePackageBrief(value: unknown): PackageBrief {
  if (!value || typeof value !== 'object') return EMPTY_PACKAGE_BRIEF;
  const raw = value as Partial<Record<keyof PackageBrief, unknown>>;
  const field = (key: keyof PackageBrief) => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const maintenancePreference: MaintenancePlanPreference =
    raw.maintenancePlanPreference === 'none'
      || raw.maintenancePlanPreference === 'basic'
      || raw.maintenancePlanPreference === 'advanced'
      || raw.maintenancePlanPreference === 'later'
      ? raw.maintenancePlanPreference
      : 'later';
  return {
    contactName: field('contactName'),
    contactPhone: field('contactPhone'),
    businessName: field('businessName'),
    businessSummary: field('businessSummary'),
    siteGoal: field('siteGoal'),
    stylePreference: field('stylePreference'),
    referenceNotes: field('referenceNotes'),
    customDomainPreference: field('customDomainPreference'),
    maintenancePlanPreference: maintenancePreference,
    maintenanceSecurityAddOn: raw.maintenanceSecurityAddOn === true && maintenancePreference !== 'none' && maintenancePreference !== 'later',
  };
}

export function isPackageModuleAvailable(moduleId: PackageModuleId): boolean {
  return isPaidPackageModuleAvailable(moduleId as PaidPackageModuleId);
}

export type MaintenancePlanOption = {
  id: MaintenancePlanPreference;
  name: string;
  priceLabel: string;
  description: string;
};

export function getMaintenancePlanOptions(): MaintenancePlanOption[] {
  return [
    {
      id: 'later',
      name: 'Configurar luego',
      priceLabel: 'Decides al final',
      description: 'Elige esto si no estás seguro todavía. Podrás decidir antes de publicar el sitio.',
    },
    {
      id: 'none',
      name: 'Sin mantenimiento',
      priceLabel: '$0/mes',
      description: 'Conservas la versión entregada como definitiva y avanzas directo a indexarla en tu dominio.',
    },
    {
      id: 'basic',
      name: 'Mantenimiento básico',
      priceLabel: `Desde ${formatMxPrice(PACKAGE_PRICING.monthly.maintenanceFrom)}/mes`,
      description: 'Cambios ligeros y actualizaciones mensuales.',
    },
    {
      id: 'advanced',
      name: 'Mantenimiento avanzado',
      priceLabel: `Desde ${formatMxPrice(PACKAGE_PRICING.monthly.operationalMaintenanceFrom)}/mes`,
      description: 'Cambios semanales, mayor flexibilidad.',
    },
  ];
}

export const MAINTENANCE_SECURITY_ADD_ON = {
  priceLabel: `+ ${formatMxPrice(PACKAGE_PRICING.monthly.securityAddOnFrom)}/mes`,
  description: 'Revisiones periódicas, auditorías y pruebas diarias de salud.',
};

export function savePackageDraft(draft: PackageDraft) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, images: [] }));
}

export function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
