/** Resolves only files inside an immutable commercial-demo release prefix. */
export function releaseObjectKey(
  prefix: string,
  manifest: { routes: Array<{ path: string; artifactPath: string }> },
  pathname: string,
): string | null {
  if (!prefix.startsWith('commercial-demos/') || prefix.includes('..') || /%|\\/.test(pathname)) return null;
  const route = manifest.routes.find((item) => item.path === pathname);
  if (route && /^(?:[a-z0-9-]+\/)*index\.html$/.test(route.artifactPath)) return `${prefix}${route.artifactPath}`;
  // HTML is addressable only through the immutable route manifest. Static
  // dependencies may live at the root (for example /styles.css) or in nested
  // asset folders, but dot segments, encoded paths and reserved files remain
  // unreachable.
  if (/^\/(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:css|js|mjs|json|png|jpe?g|webp|avif|gif|svg|ico|woff2?|webmanifest|txt|mp4)$/i.test(pathname)) {
    return `${prefix}${pathname.slice(1)}`;
  }
  return null;
}
