/**
 * Convenciones de claves (keys) para R2. Centralizadas para que público y
 * admin generen rutas consistentes. NUNCA construir claves a mano fuera de aquí.
 *
 * Layout:
 *   publications/<publicationId>/<uuid>.<ext>   imágenes de galería
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
