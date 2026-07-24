import type { PackageDraft, PackageModuleId } from './packageBuilderModel';

export type PackagePreviewMode = 'public' | 'admin';

export type PackagePreviewScreenId =
  | 'public-inicio'
  | 'public-blog'
  | 'public-galerias'
  | 'public-catalogo'
  | 'public-catalogo-detalle'
  | 'public-formulario'
  | 'public-eventos'
  | 'public-carrito'
  | 'public-docs'
  | 'admin-resumen'
  | 'admin-blog'
  | 'admin-galerias'
  | 'admin-catalogo'
  | 'admin-solicitudes'
  | 'admin-eventos'
  | 'admin-docs'
  | 'admin-compras'
  | 'admin-resultados';

export type PackagePreviewScreen = {
  id: PackagePreviewScreenId;
  label: string;
  image: string;
  mode: PackagePreviewMode;
  moduleId?: PackageModuleId;
};

const ASSET_ROOT = '/assets/package-preview/concepts';

export const PUBLIC_HOME_SCREEN: PackagePreviewScreen = {
  id: 'public-inicio',
  label: 'Inicio',
  image: `${ASSET_ROOT}/public-inicio.png`,
  mode: 'public',
  moduleId: 'landing',
};

export const PUBLIC_CATALOG_DETAIL_SCREEN: PackagePreviewScreen = {
  id: 'public-catalogo-detalle',
  label: 'Detalle de catálogo',
  image: `${ASSET_ROOT}/public-catalogo-detalle.png`,
  mode: 'public',
  moduleId: 'catalog',
};

const PUBLIC_SCREEN_BY_MODULE: Partial<Record<PackageModuleId, PackagePreviewScreen>> = {
  blog: {
    id: 'public-blog',
    label: 'Blog',
    image: `${ASSET_ROOT}/public-blog.png`,
    mode: 'public',
    moduleId: 'blog',
  },
  galleries: {
    id: 'public-galerias',
    label: 'Galerías',
    image: `${ASSET_ROOT}/public-galerias.png`,
    mode: 'public',
    moduleId: 'galleries',
  },
  catalog: {
    id: 'public-catalogo',
    label: 'Catálogo',
    image: `${ASSET_ROOT}/public-catalogo.png`,
    mode: 'public',
    moduleId: 'catalog',
  },
  quote: {
    id: 'public-formulario',
    label: 'Formulario',
    image: `${ASSET_ROOT}/public-formulario.png`,
    mode: 'public',
    moduleId: 'quote',
  },
  events: {
    id: 'public-eventos',
    label: 'Eventos',
    image: `${ASSET_ROOT}/public-eventos.png`,
    mode: 'public',
    moduleId: 'events',
  },
  cart: {
    id: 'public-carrito',
    label: 'Carrito',
    image: `${ASSET_ROOT}/public-carrito.png`,
    mode: 'public',
    moduleId: 'cart',
  },
  docs: {
    id: 'public-docs',
    label: 'Docs',
    image: `${ASSET_ROOT}/public-docs.png`,
    mode: 'public',
    moduleId: 'docs',
  },
};

const ADMIN_HOME_SCREEN: PackagePreviewScreen = {
  id: 'admin-resumen',
  label: 'Resumen',
  image: `${ASSET_ROOT}/admin-resumen.png`,
  mode: 'admin',
  moduleId: 'panel',
};

const ADMIN_SCREEN_BY_MODULE: Partial<Record<PackageModuleId, PackagePreviewScreen>> = {
  blog: {
    id: 'admin-blog',
    label: 'Blog',
    image: `${ASSET_ROOT}/admin-blog.png`,
    mode: 'admin',
    moduleId: 'blog',
  },
  galleries: {
    id: 'admin-galerias',
    label: 'Galerías',
    image: `${ASSET_ROOT}/admin-galerias.png`,
    mode: 'admin',
    moduleId: 'galleries',
  },
  catalog: {
    id: 'admin-catalogo',
    label: 'Catálogo',
    image: `${ASSET_ROOT}/admin-catalogo.png`,
    mode: 'admin',
    moduleId: 'catalog',
  },
  quote: {
    id: 'admin-solicitudes',
    label: 'Solicitudes',
    image: `${ASSET_ROOT}/admin-solicitudes.png`,
    mode: 'admin',
    moduleId: 'quote',
  },
  events: {
    id: 'admin-eventos',
    label: 'Eventos',
    image: `${ASSET_ROOT}/admin-eventos.png`,
    mode: 'admin',
    moduleId: 'events',
  },
  docs: {
    id: 'admin-docs',
    label: 'Docs',
    image: `${ASSET_ROOT}/admin-docs.png`,
    mode: 'admin',
    moduleId: 'docs',
  },
  cart: {
    id: 'admin-compras',
    label: 'Compras',
    image: `${ASSET_ROOT}/admin-compras.png`,
    mode: 'admin',
    moduleId: 'cart',
  },
  data: {
    id: 'admin-resultados',
    label: 'Resultados',
    image: `${ASSET_ROOT}/admin-resultados.png`,
    mode: 'admin',
    moduleId: 'data',
  },
};

const PUBLIC_ORDER: PackageModuleId[] = [
  'blog',
  'galleries',
  'catalog',
  'quote',
  'events',
  'cart',
  'docs',
];

const ADMIN_ORDER: PackageModuleId[] = [
  'blog',
  'galleries',
  'catalog',
  'quote',
  'events',
  'docs',
  'cart',
  'data',
];

export function getPackagePreviewScreens(draft: PackageDraft) {
  if (draft.plan === 'free') {
    return {
      public: [PUBLIC_HOME_SCREEN],
      admin: [] as PackagePreviewScreen[],
    };
  }

  const selected = new Set(draft.modules);
  const publicScreens = [
    PUBLIC_HOME_SCREEN,
    ...PUBLIC_ORDER.flatMap((moduleId) => {
      const screen = PUBLIC_SCREEN_BY_MODULE[moduleId];
      return selected.has(moduleId) && screen ? [screen] : [];
    }),
  ];
  const adminScreens = [
    ADMIN_HOME_SCREEN,
    ...ADMIN_ORDER.flatMap((moduleId) => {
      const screen = ADMIN_SCREEN_BY_MODULE[moduleId];
      return selected.has(moduleId) && screen ? [screen] : [];
    }),
  ];

  return { public: publicScreens, admin: adminScreens };
}

export function getPreviewScreenById(
  screens: PackagePreviewScreen[],
  id: PackagePreviewScreenId,
) {
  return screens.find((screen) => screen.id === id);
}
