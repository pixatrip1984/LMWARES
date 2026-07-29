import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { sanitizeFreeImage } from './image-sanitizer.mjs';

test('reencodifica como WebP, limita dimensiones y elimina metadatos', async () => {
  const source = await sharp({
    create: {
      width: 3_000,
      height: 2_000,
      channels: 3,
      background: { r: 240, g: 170, b: 30 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const sanitized = await sanitizeFreeImage(source);
  const metadata = await sharp(sanitized.bytes).metadata();

  assert.equal(sanitized.contentType, 'image/webp');
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.ok(Math.max(sanitized.width, sanitized.height) <= 2_400);
  assert.match(sanitized.checksum, /^[a-f0-9]{64}$/);
});

test('rechaza imágenes demasiado pequeñas', async () => {
  const source = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();

  await assert.rejects(() => sanitizeFreeImage(source), /Dimensiones no permitidas/);
});

test('rechaza formatos activos aunque Sharp pueda decodificarlos', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%"/></svg>',
  );
  await assert.rejects(() => sanitizeFreeImage(svg), /no es JPG, PNG o WebP/);
});
