/**
 * Convenciones de claves (keys) para R2. Centralizadas para que público y
 * admin generen rutas consistentes. NUNCA construir claves a mano fuera de aquí.
 *
 * Layout:
 *   publications/<publicationId>/<uuid>.<ext>   imágenes de galería
 *   free-intakes/<intakeId>/original/<uuid>.<ext> imágenes públicas en cuarentena
 *   free-intakes/<intakeId>/sanitized/<uuid>.<ext> derivados seguros
 *   free-sites/<slug>/<version>/index.html       sitio Free publicado
 *   uploads/<yyyy>/<mm>/<uuid>.<ext>            subidas genéricas
 */
export function publicationImageKey(
  publicationId: string,
  fileId: string,
  ext: string,
): string {
  return `publications/${publicationId}/${fileId}.${normalizeExt(ext)}`;
}

export function genericUploadKey(fileId: string, ext: string, date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${yyyy}/${mm}/${fileId}.${normalizeExt(ext)}`;
}

export function freeIntakeOriginalImageKey(
  intakeId: string,
  fileId: string,
  ext: string,
): string {
  return `free-intakes/${intakeId}/original/${fileId}.${normalizeExt(ext)}`;
}

export function freeIntakeSanitizedImageKey(
  intakeId: string,
  fileId: string,
  ext: string,
): string {
  return `free-intakes/${intakeId}/sanitized/${fileId}.${normalizeExt(ext)}`;
}

export function freeSiteArtifactKey(slug: string, version: number, fileName: string): string {
  const cleanFile = fileName.replace(/^\/+/, '').replace(/\\/g, '/');
  return `free-sites/${slug}/${version}/${cleanFile}`;
}

/** Deriva una extensión razonable desde un content-type. */
export function extFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };
  return map[contentType] ?? 'bin';
}

function normalizeExt(ext: string): string {
  return ext.replace(/^\./, '').toLowerCase();
}
