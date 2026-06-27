/**
 * Configuración por proyecto/cliente. Esta es la "capa de personalización":
 * la lógica específica (seguros, trailas, etc.) se agrega aquí + campos extra,
 * sin tocar el motor base.
 */
export interface ProjectConfig {
  /** Identificador corto del proyecto (slug). */
  slug: string;
  /** Nombre visible de la marca/negocio. */
  brandName: string;
  locale: string;
  /** URL pública del frontend (para canonical/SEO). */
  publicBaseUrl: string;
  /** Tipos de solicitud aceptados por el formulario público. */
  requestTypes: string[];
  /** Límites de subida de imágenes. */
  uploads: {
    maxImageBytes: number;
    allowedImageTypes: string[];
  };
  /** Banderas de funcionalidad para activar/desactivar módulos. */
  features: {
    publications: boolean;
    requests: boolean;
    gallery: boolean;
  };
}

export const defaultProjectConfig: ProjectConfig = {
  slug: 'starter',
  brandName: 'Starter',
  locale: 'es-MX',
  publicBaseUrl: 'http://localhost:5173',
  requestTypes: ['contact', 'quote'],
  uploads: {
    maxImageBytes: 5 * 1024 * 1024, // 5 MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  },
  features: {
    publications: true,
    requests: true,
    gallery: true,
  },
};

/** Combina la config por defecto con overrides parciales del proyecto. */
export function defineProjectConfig(overrides: Partial<ProjectConfig>): ProjectConfig {
  return {
    ...defaultProjectConfig,
    ...overrides,
    uploads: { ...defaultProjectConfig.uploads, ...overrides.uploads },
    features: { ...defaultProjectConfig.features, ...overrides.features },
  };
}
