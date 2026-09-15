const STATIC_RELEASE_PATH = /^\/(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:css|js|mjs|json|png|jpe?g|webp|avif|gif|svg|ico|woff2?|webmanifest|txt|mp4)$/i;
const HTML_ARTIFACT_PATH = /^(?:[a-z0-9-]+\/)*index\.html$/;

/** Resolves only files that belong to an immutable Creative Studio release. */
export function releaseArtifactPath(
  prefix: string,
  manifest: { routes: Array<{ path: string; artifactPath: string }> },
  pathname: string,
): string | null {
  if (!prefix.startsWith('commercial-demos/') || prefix.includes('..') || /%|\\/.test(pathname)) return null;

  const normalizedPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const route = manifest.routes.find((item) => item.path === normalizedPath);
  if (route && HTML_ARTIFACT_PATH.test(route.artifactPath)) return route.artifactPath;

  // HTML remains restricted to routes declared by Oracle. A release may also
  // contain root-level or nested static dependencies such as /styles.css.
  return STATIC_RELEASE_PATH.test(pathname) ? pathname.slice(1) : null;
}

/** Re-bases root-absolute release links onto the authenticated review proxy. */
export function rewriteReleaseHtmlForReview(html: string, basePath: string): string {
  const withBase = /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (tag) => `${tag}<base href="${basePath}">`)
    : `<base href="${basePath}">${html}`;

  return withBase
    .replace(/\b(href|src|action|poster)=(['"])\/(?!\/)([^'"]*)/gi, `$1=$2${basePath}$3`)
    .replace(/\bsrcset=(['"])([^'"]*)\1/gi, (_match, quote: string, value: string) => {
      const rewritten = value
        .split(',')
        .map((candidate) => candidate.trim().replace(/^\/(?!\/)/, basePath))
        .join(', ');
      return `srcset=${quote}${rewritten}${quote}`;
    });
}

/** Keeps root-absolute image/font references inside the same private release. */
export function rewriteReleaseCssForReview(css: string, basePath: string): string {
  return css
    .replace(/url\(\s*(['"]?)\/(?!\/)([^)'"\s]+)\1\s*\)/gi, (_match, quote: string, path: string) => {
      const delimiter = quote || '';
      return `url(${delimiter}${basePath}${path}${delimiter})`;
    })
    .replace(/@import\s+(['"])\/(?!\/)([^'"]+)\1/gi, (_match, quote: string, path: string) => {
      return `@import ${quote}${basePath}${path}${quote}`;
    });
}
