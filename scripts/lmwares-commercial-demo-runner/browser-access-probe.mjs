const CHALLENGE_TITLE = /(?:just a moment|un momento|checking your browser|verificando tu navegador)/i;
const LOGIN_PATH = /\/(?:auth|login|signin)(?:\/|$)/i;

export async function probeBrowserAccess({ endpoint = 'http://127.0.0.1:9223', extensionId = '' } = {}) {
  let targets;
  try { targets = await listTargets(endpoint); }
  catch (error) { return { category: 'network-unavailable', confidence: 'high', message: `No se pudo consultar DevTools: ${messageOf(error)}`, observedAt: new Date().toISOString(), extension: 'unknown' }; }

  const extension = extensionId && targets.some((target) => target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/demo-service-worker.js`) ? 'ready' : 'unknown';
  const page = targets.find((target) => target.type === 'page' && /^https:\/\/chatgpt\.com\//i.test(target.url || ''));
  if (!page?.webSocketDebuggerUrl) {
    return { category: extensionId && extension !== 'ready' ? 'extension-unavailable' : 'chat-unavailable', confidence: 'high', message: 'No hay una página de ChatGPT accesible en el navegador dedicado.', observedAt: new Date().toISOString(), extension };
  }
  try {
    const surface = await evaluate(page.webSocketDebuggerUrl, pageSurfaceExpression());
    return { ...classifyBrowserSurface(surface), observedAt: new Date().toISOString(), extension, pageUrl: safePageUrl(page.url) };
  } catch (error) {
    return { category: 'unknown', confidence: 'low', message: `No se pudo observar la página de ChatGPT: ${messageOf(error)}`, observedAt: new Date().toISOString(), extension, pageUrl: safePageUrl(page.url) };
  }
}

export function classifyBrowserSurface(surface = {}) {
  const title = String(surface.title || '');
  const pathname = String(surface.pathname || '');
  const challenge = Boolean(surface.challengeFrame || surface.turnstileWidget || CHALLENGE_TITLE.test(title));
  if (challenge && !surface.composer) return { category: 'challenge', confidence: surface.challengeFrame || CHALLENGE_TITLE.test(title) ? 'high' : 'medium', message: 'ChatGPT muestra una verificación de acceso.', surface: sanitizeSurface(surface) };
  if (LOGIN_PATH.test(pathname) || surface.loginControl) return { category: 'login-required', confidence: 'high', message: 'ChatGPT requiere iniciar sesión o completar una verificación de identidad.', surface: sanitizeSurface(surface) };
  if (surface.accessDenied) return { category: 'access-denied', confidence: 'high', message: 'ChatGPT rechazó el acceso del navegador dedicado.', surface: sanitizeSurface(surface) };
  if (surface.composer && !challenge) return { category: 'ready', confidence: 'high', message: 'La superficie de trabajo de ChatGPT está disponible.', surface: sanitizeSurface(surface) };
  return { category: 'unknown', confidence: 'low', message: 'ChatGPT cargó una superficie no clasificable todavía.', surface: sanitizeSurface(surface) };
}

async function listTargets(endpoint) {
  const response = await fetch(new URL('/json/list', endpoint));
  if (!response.ok) throw new Error(`DevTools respondió HTTP ${response.status}.`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('DevTools no devolvió una lista de targets.');
  return targets;
}

function pageSurfaceExpression() {
  return `JSON.stringify((() => { const q = (selector) => Boolean(document.querySelector(selector)); return {
    title: String(document.title || '').slice(0, 160), pathname: String(location.pathname || '').slice(0, 300),
    composer: q('#prompt-textarea[contenteditable="true"], #prompt-textarea.ProseMirror'),
    challengeFrame: q('iframe[src*="challenges.cloudflare.com" i], iframe[title*="challenge" i]'),
    turnstileWidget: q('[data-turnstile-response], .cf-turnstile, [id*="turnstile" i]'),
    loginControl: q('button[data-testid*="login" i], a[href*="/auth/login" i], input[type="password"]'),
    accessDenied: q('[data-testid*="access-denied" i], [data-testid*="error" i]'),
    readyState: document.readyState, visibilityState: document.visibilityState
  }; })())`;
}

function sanitizeSurface(surface) {
  return {
    title: String(surface.title || '').slice(0, 160), pathname: String(surface.pathname || '').slice(0, 300),
    composer: Boolean(surface.composer), challengeFrame: Boolean(surface.challengeFrame), turnstileWidget: Boolean(surface.turnstileWidget),
    loginControl: Boolean(surface.loginControl), accessDenied: Boolean(surface.accessDenied), readyState: String(surface.readyState || ''), visibilityState: String(surface.visibilityState || ''),
  };
}

function safePageUrl(value) { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return ''; } }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }

function evaluate(url, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => { socket.close(); reject(new Error('DevTools no respondió.')); }, 5_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout); socket.close();
      if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text || 'Falló la observación DevTools.'));
      else {
        try { resolve(JSON.parse(message.result?.result?.value || '{}')); }
        catch { reject(new Error('La observación DevTools no devolvió JSON válido.')); }
      }
    });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('No se pudo conectar a DevTools.')); });
  });
}
