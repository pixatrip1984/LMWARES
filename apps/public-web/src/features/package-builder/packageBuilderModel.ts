import {
  COMMERCIAL_PACKAGE_PRICING_CENTS,
  isPaidPackageModuleAvailable,
  type PaidPackageModuleId,
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
    baseOneComplement:
      COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.baseOneComplement / 100,
    perAdditionalComplement:
      COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.perAdditionalComplement / 100,
    perPremiumModule:
      COMMERCIAL_PACKAGE_PRICING_CENTS.implementation.perPremiumModule / 100,
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
  if (plan === 'pro') return ['landing', 'panel', 'catalog', 'quote', 'blog'];
  return ['landing', 'panel', 'catalog'];
}

export function getSelectedComplements(modules: PackageModuleId[]) {
  return modules.filter((moduleId) => !FOUNDATION_MODULES.includes(moduleId));
}

export type ModuleSelectionError =
  | { kind: 'starter-needs-complement' }
  | { kind: 'pro-needs-three' };

/**
 * Reglas de selección de complementos por plan. Starter exige al menos un
 * complemento; Pro exige al menos tres (con dos, se sugiere Starter).
 */
export function getModuleSelectionError(
  plan: PlanId,
  modules: PackageModuleId[],
): ModuleSelectionError | null {
  if (plan === 'free') return null;
  const complementCount = getSelectedComplements(modules).length;
  if (plan === 'starter' && complementCount < 1) {
    return { kind: 'starter-needs-complement' };
  }
  if (plan === 'pro' && complementCount < 3) {
    return { kind: 'pro-needs-three' };
  }
  return null;
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

  // El precio se calcula de forma incremental y tolerante: no lanza aunque el
  // estado sea inválido (p. ej. Pro con menos de tres complementos), para que
  // el importe se refresque en tiempo real mientras el usuario ajusta módulos.
  // La validación de mínimos se muestra por separado en "Ver ejemplo"/enviar.
  const complements = getSelectedComplements(draft.modules);
  const premiumCount = complements.filter((id) => id === 'cart' || id === 'data').length;
  const standardCount = complements.length - premiumCount;
  const implementation =
    PACKAGE_PRICING.implementation.baseOneComplement
    + Math.max(0, standardCount - 1) * PACKAGE_PRICING.implementation.perAdditionalComplement
    + premiumCount * PACKAGE_PRICING.implementation.perPremiumModule;

  const implementationLabel =
    draft.plan === 'starter'
      ? complements.length >= 2
        ? `Starter · ${complements.length} complementos`
        : complements.length === 1
          ? 'Starter · 1 complemento'
          : 'Starter · base mínima'
      : complements.length >= 3
        ? `Pro · ${complements.length} complementos`
        : complements.length === 2
          ? 'Pro · 2 complementos'
          : complements.length === 1
            ? 'Pro · 1 complemento'
            : 'Pro base';

  return {
    implementation,
    implementationLabel,
    maintenanceFrom: PACKAGE_PRICING.monthly.maintenanceFrom,
    operationalMaintenanceFrom: PACKAGE_PRICING.monthly.operationalMaintenanceFrom,
    securityAddOnFrom: PACKAGE_PRICING.monthly.securityAddOnFrom,
    astramusesMonthly: PACKAGE_PRICING.monthly.astramusesStaticFrom,
    monthlyOptionalFrom: PACKAGE_PRICING.monthly.astramusesStaticFrom,
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
      description: 'No incluye dominio: tú lo compras; nosotros montamos tu sitio en él.',
    },
    {
      id: 'basic',
      name: 'Mantenimiento básico',
      priceLabel: `Desde ${formatMxPrice(PACKAGE_PRICING.monthly.maintenanceFrom)}/mes`,
      description: 'Incluye un dominio y cambios ligeros mensuales.',
    },
    {
      id: 'advanced',
      name: 'Mantenimiento avanzado',
      priceLabel: `Desde ${formatMxPrice(PACKAGE_PRICING.monthly.operationalMaintenanceFrom)}/mes`,
      description: 'Incluye un dominio y cambios ligeros semanales.',
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
