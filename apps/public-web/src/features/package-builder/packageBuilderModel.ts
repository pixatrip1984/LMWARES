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
};

export type DraftImage = {
  id: string;
  name: string;
  size: number;
  type: string;
};

export type PackageDraft = {
  plan: PlanId;
  modules: PackageModuleId[];
  marketing: boolean;
  images: DraftImage[];
  updatedAt: string;
};

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];
export const FOUNDATION_MODULES: PackageModuleId[] = ['landing', 'panel'];
export const PRO_ONLY_MODULES: PackageModuleId[] = ['cart', 'data'];

export const PACKAGE_MODULES: PackageModule[] = [
  {
    id: 'landing',
    name: 'Landing',
    eyebrow: 'Base',
    description: 'Una página orientada a captar y convertir.',
    tier: 'base',
  },
  {
    id: 'panel',
    name: 'Panel',
    eyebrow: 'Base',
    description: 'Controla contenido y actividad del sistema.',
    tier: 'base',
  },
  {
    id: 'blog',
    name: 'Blog',
    eyebrow: 'Contenido',
    description: 'Publicaciones dentro de una estructura clara.',
    tier: 'starter',
  },
  {
    id: 'galleries',
    name: 'Galerías',
    eyebrow: 'Muestra',
    description: 'Colecciones visuales para proyectos y servicios.',
    tier: 'starter',
  },
  {
    id: 'catalog',
    name: 'Catálogo',
    eyebrow: 'Orden',
    description: 'Productos o servicios organizados y consultables.',
    tier: 'starter',
  },
  {
    id: 'quote',
    name: 'Formulario',
    eyebrow: 'Solicitud',
    description: 'Recibe datos, referencias y solicitudes con claridad.',
    tier: 'starter',
  },
  {
    id: 'events',
    name: 'Eventos',
    eyebrow: 'Agenda',
    description: 'Fechas, registros y actividad programada.',
    tier: 'starter',
  },
  {
    id: 'docs',
    name: 'Docs',
    eyebrow: 'Conocimiento',
    description: 'Información operativa y documentación navegable.',
    tier: 'starter',
  },
  {
    id: 'cart',
    name: 'Carrito',
    eyebrow: 'Comercio',
    description: 'Selección, pedido y flujo comercial avanzado.',
    tier: 'pro',
  },
  {
    id: 'data',
    name: 'Optimization',
    eyebrow: 'Evidencia',
    description: 'Ciclos de medición, decisión y mejora continua.',
    tier: 'pro',
  },
];

export const DEFAULT_DRAFT: PackageDraft = {
  plan: 'starter',
  modules: ['landing', 'panel', 'catalog', 'quote'],
  marketing: false,
  images: [],
  updatedAt: new Date(0).toISOString(),
};

export const FREE_IMAGE_LIMIT = 10;
export const FREE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const DRAFT_KEY = 'lmwares.package-draft.v1';

export function getRecommendedPlan(modules: PackageModuleId[], marketing: boolean): PlanId {
  if (modules.some((moduleId) => PRO_ONLY_MODULES.includes(moduleId))) return 'pro';
  if (modules.length > 0 || marketing) return 'starter';
  return 'free';
}

export function getPlanSeed(plan: PlanId): PackageModuleId[] {
  if (plan === 'free') return [];
  if (plan === 'pro') return ['landing', 'panel', 'catalog', 'cart', 'data'];
  return ['landing', 'panel', 'catalog'];
}

export function getSelectedComplements(modules: PackageModuleId[]) {
  return modules.filter((moduleId) => !FOUNDATION_MODULES.includes(moduleId));
}

export function getPackageLabel(plan: PlanId, modules: PackageModuleId[]) {
  if (plan === 'free') return 'Página informativa · 10 imágenes';
  if (plan === 'pro') return 'Capacidad completa habilitada';

  const complementCount = getSelectedComplements(modules).length;
  if (complementCount === 0) return 'Hasta 2 complementos incluidos';
  return `${complementCount} de 2 complementos ${complementCount === 1 ? 'seleccionado' : 'seleccionados'}`;
}

export function togglePackageModule(
  current: PackageModuleId[],
  moduleId: PackageModuleId,
): { modules: PackageModuleId[]; message?: string } {
  const selected = new Set(current);
  const foundationSelected = FOUNDATION_MODULES.every((id) => selected.has(id));
  const hasComplements = current.some((id) => !FOUNDATION_MODULES.includes(id));

  if (FOUNDATION_MODULES.includes(moduleId)) {
    if (foundationSelected && hasComplements) {
      return {
        modules: current,
        message: 'Landing y Panel forman la base de los módulos seleccionados.',
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
      ? parsed.modules.filter((id): id is PackageModuleId => validIds.has(id as PackageModuleId))
      : DEFAULT_DRAFT.modules;

    const plan = parsed.plan === 'free' || parsed.plan === 'starter' || parsed.plan === 'pro'
      ? parsed.plan
      : getRecommendedPlan(modules, parsed.marketing === true);
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
      marketing: parsed.marketing === true,
      images: Array.isArray(parsed.images) ? parsed.images.slice(0, FREE_IMAGE_LIMIT) : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : DEFAULT_DRAFT.updatedAt,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function savePackageDraft(draft: PackageDraft) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
