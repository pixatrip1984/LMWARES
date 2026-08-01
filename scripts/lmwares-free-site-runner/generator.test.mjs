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
        layoutPreset: 'showcase',
        palettePreset: 'professional-blue',
        location: {
          address: 'Centro, Monterrey, Nuevo León',
          latitude: 25.686614,
          longitude: -100.316113,
          zoom: 16,
        },
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

  assert.equal(manifest.generator, 'lmwares-free-site-runner/static-v4');
  assert.deepEqual(manifest.layout, { name: 'showcase', source: 'customer' });
  assert.deepEqual(manifest.theme, { name: 'professional', source: 'palettePreset' });
  assert.match(html, /<title>Negocio Demo · Página informativa<\/title>/);
  assert.match(html, /<body class="layout-showcase">/);
  assert.match(html, /https:\/\/api\.lmwares\.com\/media\/free-sites\/negocio-demo\/demo\.webp/);
  assert.match(html, /https:\/\/wa\.me\/528112345678/);
  assert.match(html, /openstreetmap\.org\/export\/embed\.html/);
  assert.match(html, /Centro, Monterrey, Nuevo León/);
  assert.match(html, /google\.com\/maps\/search\/\?api=1&amp;query=25\.686614%2C-100\.316113/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /id="lmwares-free-responsive-v1"/);
  assert.match(html, /@media \(max-width: 640px\)/);
  assert.match(html, /@media \(max-width: 390px\)/);
  assert.match(html, /\.actions \.button \{[\s\S]*?width: 100%/);
  assert.match(html, /\.location-map,[\s\S]*?min-height: 300px/);
  assert.doesNotMatch(html, /\bundefined\b/);
});

test('renderiza todas las composiciones y paletas sin IA ni valores indeterminados', () => {
  const layouts = ['editorial', 'impact', 'minimal', 'showcase'];
  const palettes = {
    'professional-blue': 'professional',
    'clinical-teal': 'clinical',
    'industrial-orange': 'industrial',
    'natural-green': 'natural-green',
    'culinary-terra': 'culinary',
    'wellness-rose': 'wellness',
    'night-fire': 'deep-fire',
  };

  for (const layoutPreset of layouts) {
    for (const [palettePreset, themeName] of Object.entries(palettes)) {
      const intake = {
        id: `intake-${layoutPreset}-${palettePreset}`,
        slug: `demo-${layoutPreset}-${palettePreset}`,
        siteName: 'Sitio determinista',
        style: 'Directo',
        audience: 'Público local',
        sector: 'Servicios',
        primaryAction: 'Contactar',
        businessDescription: 'Una prueba reproducible.',
        metadata: {
          freePage: {
            services: ['Servicio'],
            layoutPreset,
            palettePreset,
          },
        },
      };
      const manifest = buildManifest({
        job: { id: 'job-presets', attempt: 1 },
        intake,
        contacts: [],
        assets: [],
      });
      const html = renderSite({
        intake,
        contacts: [],
        assets: [],
        manifest,
        apiUrl: 'https://api.lmwares.com',
      });

      assert.equal(manifest.layout.name, layoutPreset);
      assert.equal(manifest.theme.name, themeName);
      assert.match(html, new RegExp(`<body class="layout-${layoutPreset}">`));
      assert.doesNotMatch(html, /\bundefined\b/);
    }
  }
});

test('descarta una ubicación incompleta en vez de publicar un mapa incorrecto', () => {
  const intake = {
    id: 'intake-location-invalid',
    slug: 'ubicacion-invalida',
    siteName: 'Ubicación inválida',
    style: 'Editorial',
    audience: 'Público local',
    sector: 'Servicios',
    primaryAction: 'Contactar',
    businessDescription: 'No debe mostrar un mapa sin coordenadas válidas.',
    metadata: {
      freePage: {
        services: ['Servicio'],
        location: {
          address: 'Dirección sin coordenadas válidas',
          latitude: 100,
          longitude: -200,
        },
      },
    },
  };
  const manifest = buildManifest({
    job: { id: 'job-location', attempt: 1 },
    intake,
    contacts: [],
    assets: [],
  });
  const html = renderSite({
    intake,
    contacts: [],
    assets: [],
    manifest,
    apiUrl: 'https://api.lmwares.com',
  });

  assert.equal(manifest.freePage.location, null);
  assert.doesNotMatch(html, /openstreetmap\.org\/export\/embed\.html/);
});
