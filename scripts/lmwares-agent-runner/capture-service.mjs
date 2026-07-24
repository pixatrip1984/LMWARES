import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { readCaptureManifest, saveCaptureAsset } from './capture-store.mjs';

const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const SCREEN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const FRAME_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const WINDOWS_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

export class CaptureServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CaptureServiceError';
    this.status = status;
    this.code = code;
  }
}

export function createCaptureService({ designsRoot, browserExecutable, launch = puppeteer.launch }) {
  return {
    async capture(projectId, input) {
      const request = await validateRequest({ designsRoot, projectId, input });
      const executablePath = browserExecutable ?? (await findBrowserExecutable());
      const profilePath = await mkdtemp(path.join(os.tmpdir(), 'lmwares-capture-'));
      let browser;
      try {
        browser = await launch({
          executablePath,
          headless: true,
          userDataDir: profilePath,
          args: [
            '--disable-background-networking',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-features=Translate,BackForwardCache',
            '--disable-sync',
            '--hide-scrollbars',
            '--no-first-run',
            '--no-default-browser-check',
          ],
        });
        const page = await browser.newPage();
        await page.setViewport(DEFAULT_VIEWPORT);
        await page.evaluateOnNewDocument(() => {
          window.setInterval = () => 0;
        });
        const targetUrl = new URL(request.route, request.baseUrl);
        if (targetUrl.origin !== new URL(request.baseUrl).origin) {
          throw new CaptureServiceError(422, 'capture_route_outside_project', 'La ruta sale del proyecto local.');
        }
        await page.goto(targetUrl.href, { waitUntil: 'networkidle2', timeout: 30_000 });
        await settlePage(page);
        const image =
          request.strategy === 'viewport'
            ? await captureViewport(page)
            : await captureSectionStack(page);
        const saved = await saveCaptureAsset({
          designsRoot,
          projectId,
          screenId: request.screenId,
          frameId: request.frameId,
          route: request.route,
          body: image.body,
          contentType: 'image/jpeg',
          width: image.width,
          height: image.height,
          baseUrl: request.baseUrl,
          source: request.strategy === 'viewport' ? 'browser-local-viewport' : 'browser-local-sections',
        });
        return { ...saved, strategy: request.strategy, segments: image.segments ?? [] };
      } catch (error) {
        if (error instanceof CaptureServiceError) throw error;
        throw new CaptureServiceError(
          500,
          'capture_failed',
          error instanceof Error ? error.message : 'No fue posible capturar la pantalla.',
        );
      } finally {
        await browser?.close().catch(() => {});
        await rm(profilePath, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

async function validateRequest({ designsRoot, projectId, input }) {
  if (!designsRoot || !path.isAbsolute(designsRoot)) {
    throw new CaptureServiceError(503, 'capture_store_unavailable', 'El almacén visual no está configurado.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CaptureServiceError(422, 'invalid_capture_request', 'La solicitud de captura es inválida.');
  }
  const allowed = new Set(['screenId', 'frameId', 'route', 'baseUrl', 'strategy']);
  const unknown = Object.keys(input).find((key) => !allowed.has(key));
  if (unknown) {
    throw new CaptureServiceError(422, 'unknown_capture_field', `Campo no permitido: ${unknown}.`);
  }
  if (typeof input.screenId !== 'string' || !SCREEN_ID_PATTERN.test(input.screenId)) {
    throw new CaptureServiceError(422, 'invalid_screen_id', 'screenId es inválido.');
  }
  const frameId = !input.frameId || input.frameId === 'default' ? 'primary' : input.frameId;
  if (typeof frameId !== 'string' || !FRAME_ID_PATTERN.test(frameId)) {
    throw new CaptureServiceError(422, 'invalid_frame_id', 'frameId es inválido.');
  }
  if (typeof input.route !== 'string' || !input.route.startsWith('/')) {
    throw new CaptureServiceError(422, 'invalid_capture_route', 'La ruta de captura es inválida.');
  }
  const manifest = await readCaptureManifest({ designsRoot, projectId });
  const previous = manifest.captures.find(
    (capture) => capture.screenId === input.screenId && capture.frameId === frameId,
  );
  const route = input.route.includes(':') && previous ? previous.route : input.route;
  const baseUrl = input.baseUrl ?? manifest.baseUrl;
  assertLocalBaseUrl(baseUrl);
  const strategy = input.strategy === 'viewport' ? 'viewport' : 'sections';
  return { screenId: input.screenId, frameId, route, baseUrl, strategy };
}

function assertLocalBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new CaptureServiceError(422, 'invalid_capture_base_url', 'La URL local del proyecto es inválida.');
  }
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/'
  ) {
    throw new CaptureServiceError(
      403,
      'capture_base_url_not_local',
      'La captura solo puede abrir un servidor HTTP local.',
    );
  }
}

async function settlePage(page) {
  await page.addStyleTag({
    content: `
      html, body { overflow-x: hidden !important; scroll-behavior: auto !important; }
      header { position: static !important; }
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(
      images.map(
        (image) =>
          image.complete ||
          new Promise((resolve) => {
            const done = () => resolve(undefined);
            image.addEventListener('load', done, { once: true });
            image.addEventListener('error', done, { once: true });
            window.setTimeout(done, 2_500);
          }),
      ),
    );
    window.scrollTo(0, 0);
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function captureViewport(page) {
  const body = Buffer.from(
    await page.screenshot({ type: 'jpeg', quality: 88, fullPage: false, optimizeForSpeed: true }),
  );
  return { body, ...DEFAULT_VIEWPORT };
}

async function captureSectionStack(page) {
  const units = await captureUnits(page);
  if (units.length === 0) return captureViewport(page);
  const segments = [];
  for (const unit of units) {
    await unit.evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ left: 0, top, behavior: 'instant' });
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const body = Buffer.from(await unit.screenshot({ type: 'png', optimizeForSpeed: true }));
    const metadata = await sharp(body).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 80 || metadata.height < 2) continue;
    const descriptor = await unit.evaluate((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      label: element.getAttribute('aria-label') || null,
    }));
    segments.push({ body, width: metadata.width, height: metadata.height, descriptor });
  }
  if (segments.length === 0) return captureViewport(page);
  const width = Math.max(...segments.map((segment) => segment.width));
  const height = segments.reduce((total, segment) => total + segment.height, 0);
  const composite = [];
  let top = 0;
  for (const segment of segments) {
    composite.push({ input: segment.body, left: 0, top });
    top += segment.height;
  }
  const body = await sharp({
    create: { width, height, channels: 3, background: '#ffffff' },
  })
    .composite(composite)
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  return {
    body,
    width,
    height,
    segments: segments.map((segment) => ({ ...segment.descriptor, width: segment.width, height: segment.height })),
  };
}

async function captureUnits(page) {
  const candidates = await page.$$('header, main section, main, footer');
  const units = [];
  for (const candidate of candidates) {
    const include = await candidate.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 80 || rect.height < 2) {
        return false;
      }
      if (element.tagName === 'MAIN') {
        return !element.parentElement?.closest('main') && !element.querySelector('section');
      }
      if (element.tagName === 'HEADER' || element.tagName === 'FOOTER') {
        return !element.parentElement?.closest('main');
      }
      if (element.tagName === 'SECTION') {
        let parent = element.parentElement;
        while (parent && parent.tagName !== 'MAIN') {
          if (parent.tagName === 'SECTION') return false;
          parent = parent.parentElement;
        }
        return parent?.tagName === 'MAIN';
      }
      return true;
    });
    if (include) units.push(candidate);
  }
  return units;
}

async function findBrowserExecutable() {
  const candidates = [process.env.LMWARES_BROWSER_EXECUTABLE, ...WINDOWS_BROWSER_PATHS].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Sigue buscando un navegador local compatible.
    }
  }
  throw new CaptureServiceError(
    503,
    'capture_browser_not_found',
    'No se encontró Chrome o Edge para realizar la captura local.',
  );
}
