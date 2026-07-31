import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest, renderSite } from './generator.mjs';

test('genera el mismo sitio estático desde un runner local o de Cloudflare', () => {
  const job = { id: 'job-1', attempt: 1 };
  const intake = {
    id: 'intake-1',
    slug: 'negocio-demo',
    siteName: 'Negocio Demo',
    style: 'Claro y profesional',
    audience: 'Clientes locales',
    sector: 'Servicios',
    primaryAction: 'Contactar',
    businessDescription: 'Una descripción útil para clientes.',
    metadata: {
      freePage: {
        services: ['Servicio principal'],
        hours: 'Lunes a viernes',
        serviceArea: 'Monterrey',
        trustLine: 'Atención directa',
        colorPreference: 'Azul profesional',
      },
    },
  };
  const contacts = [{
    platform: 'whatsapp',
    value: '528112345678',
    label: 'WhatsApp',
    publicVisible: true,
  }];
  const assets = [{
    asset: { id: 'asset-1' },
    fileAsset: {
      id: 'file-1',
      contentType: 'image/webp',
      sizeBytes: 1024,
      checksum: 'a'.repeat(64),
    },
    mediaPath: '/media/free-sites/negocio-demo/demo.webp',
  }];

  const manifest = buildManifest({ job, intake, contacts, assets });
  const html = renderSite({
    intake,
    contacts,
    assets,
    manifest,
    apiUrl: 'https://api.lmwares.com',
  });

  assert.equal(manifest.generator, 'lmwares-free-site-runner/static-v2');
  assert.match(html, /<title>Negocio Demo · Página informativa<\/title>/);
  assert.match(html, /https:\/\/api\.lmwares\.com\/media\/free-sites\/negocio-demo\/demo\.webp/);
  assert.match(html, /https:\/\/wa\.me\/528112345678/);
  assert.doesNotMatch(html, /\bundefined\b/);
});
