import type { Context } from 'hono';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import { releaseObjectKey } from '../lib/commercial-demo-routing';

/** Serves the stable phase-0 address before and after a real demo is uploaded. */
export async function serveCommercialDemoSite(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  slug: string,
  pathname = '/',
): Promise<Response | null> {
  const lifecycle = await createRepositories(c.env.DB).lmwaresCommercialDemoLifecycles.getBySlug(slug);
  if (!lifecycle || lifecycle.status === 'canceled') return null;
  if (pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' },
    });
  }
  if (lifecycle.demoReleaseId) {
    const release = await createRepositories(c.env.DB).lmwaresCommercialDemoCreativeStudio.getReleaseById(lifecycle.demoReleaseId);
    if (release?.reviewStatus === 'approved' && release.publicationStatus === 'published') {
      const key = releaseObjectKey(release.artifactPrefix, release.routeManifest, pathname);
      if (key) {
        const object = await c.env.MEDIA.get(key);
        if (object) return publicDemoResponse(object);
      }
    }
    // A pointer to a bad/missing release must not silently expose a legacy
    // index document at every path.
    return null;
  }
  // Phase 0 is a public commercial preview, never an SEO surface. Until the
  // release resolver arrives, only the stable root has an artifact to serve.
  if (pathname !== '/') return null;
  if (lifecycle.demoAssetKey) {
    const object = await c.env.MEDIA.get(lifecycle.demoAssetKey);
    if (object) {
      return publicDemoResponse(object);
    }
  }
  return renderDemoPreparing(lifecycle.siteName);
}

function publicDemoResponse(object: R2ObjectBody): Response {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return new Response(object.body, { headers });
}

function renderDemoPreparing(siteName: string): Response {
  const safeName = escapeHtml(siteName);
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Tu demo está siendo creada · LMWares</title>
<style>
  :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#14213d;background:#f5f7ff}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);padding:40px;border:1px solid #dce5ff;border-radius:28px;background:#fff;box-shadow:0 28px 80px #3156a322;text-align:center}.mark{display:inline-grid;place-items:center;width:72px;height:72px;border-radius:22px;background:#2442a7;color:#fff;font-size:28px;box-shadow:0 16px 30px #2442a744}.stage{height:110px;margin:28px auto 20px;position:relative}.sheet{position:absolute;left:50%;width:148px;height:94px;border:1px solid #cbd7ff;border-radius:13px;background:linear-gradient(135deg,#fff,#edf1ff);box-shadow:0 12px 24px #1c347a1f;animation:assemble 2.4s ease-in-out infinite}.sheet:before,.sheet:after{content:'';position:absolute;left:16px;right:16px;height:8px;border-radius:8px;background:#c7d2ff}.sheet:before{top:22px}.sheet:after{top:42px;right:45px}.one{transform:translateX(-83px) rotate(-8deg);animation-delay:-.7s}.two{transform:translateX(-65px) translateY(8px);animation-delay:-1.4s}.three{transform:translateX(-47px) rotate(8deg);animation-delay:-2.1s}@keyframes assemble{0%,100%{margin-top:10px;opacity:.72}50%{margin-top:-5px;opacity:1}}h1{font-size:clamp(28px,6vw,42px);letter-spacing:-.04em;margin:0 0 14px}p{color:#53637f;line-height:1.65;margin:0 auto;max-width:430px}.name{color:#2442a7;font-weight:700}.status{display:inline-flex;gap:8px;align-items:center;margin-top:28px;padding:9px 13px;border-radius:999px;background:#edf1ff;color:#2442a7;font-size:14px;font-weight:700}.dot{width:8px;height:8px;border-radius:50%;background:#4f7cff;animation:pulse 1.4s ease-in-out infinite}@keyframes pulse{50%{transform:scale(.55);opacity:.55}}small{display:block;margin-top:22px;color:#7a89a2}@media(prefers-reduced-motion:reduce){.sheet,.dot{animation:none}}</style></head>
<body><main class="card"><div class="mark" aria-hidden="true">L</div><div class="stage" aria-hidden="true"><i class="sheet one"></i><i class="sheet two"></i><i class="sheet three"></i></div><h1>Tu demo está siendo creada</h1><p>Estamos preparando una primera versión de la página de <span class="name">${safeName}</span>. Vuelve aquí más tarde: este mismo enlace mostrará tu demo cuando esté lista.</p><div class="status"><i class="dot"></i>Preparando tu demo</div><small>LMWares te avisará cuando puedas verla.</small></main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow, noarchive' } });
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }
