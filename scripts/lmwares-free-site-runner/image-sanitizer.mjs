import { createHash } from 'node:crypto';
import sharp from 'sharp';

const MIN_IMAGE_DIMENSION = 64;
const MAX_IMAGE_DIMENSION = 8_000;
const MAX_IMAGE_PIXELS = 32_000_000;
const OUTPUT_MAX_DIMENSION = 2_400;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export async function sanitizeFreeImage(input) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const pipeline = sharp(source, {
    failOn: 'warning',
    limitInputPixels: MAX_IMAGE_PIXELS,
    pages: 1,
  });
  const metadata = await pipeline.metadata();

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error('La imagen no es JPG, PNG o WebP válido.');
  }
  if (!metadata.width || !metadata.height) {
    throw new Error('No fue posible determinar las dimensiones de la imagen.');
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new Error('Las imágenes animadas o multipágina no están permitidas.');
  }
  assertDimensions(metadata.width, metadata.height);

  const { data, info } = await pipeline
    .rotate()
    .resize({
      width: OUTPUT_MAX_DIMENSION,
      height: OUTPUT_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 84,
      alphaQuality: 90,
      effort: 4,
    })
    .toBuffer({ resolveWithObject: true });

  assertDimensions(info.width, info.height);
  const outputMetadata = await sharp(data).metadata();
  if (
    outputMetadata.format !== 'webp' ||
    outputMetadata.exif ||
    outputMetadata.icc ||
    outputMetadata.xmp
  ) {
    throw new Error('El derivado no superó la verificación de metadatos.');
  }

  return {
    bytes: data,
    contentType: 'image/webp',
    width: info.width,
    height: info.height,
    checksum: createHash('sha256').update(data).digest('hex'),
  };
}

function assertDimensions(width, height) {
  const pixels = width * height;
  if (
    width < MIN_IMAGE_DIMENSION ||
    height < MIN_IMAGE_DIMENSION ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new Error(
      `Dimensiones no permitidas: ${width}×${height}px. Cada lado debe medir entre ${MIN_IMAGE_DIMENSION} y ${MAX_IMAGE_DIMENSION}px.`,
    );
  }
}
