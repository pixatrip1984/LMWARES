import { AppError } from '@starter/domain';

const MIN_IMAGE_DIMENSION = 64;
const MAX_IMAGE_DIMENSION = 8_000;
const MAX_IMAGE_PIXELS = 32_000_000;

export interface InspectedFreeImage {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
}

export function inspectFreeImage(bytes: Uint8Array): InspectedFreeImage | null {
  if (isPng(bytes)) {
    const dimensions = readPngDimensions(bytes);
    return dimensions ? { contentType: 'image/png', extension: 'png', ...dimensions } : null;
  }
  if (isJpeg(bytes)) {
    const dimensions = readJpegDimensions(bytes);
    return dimensions ? { contentType: 'image/jpeg', extension: 'jpg', ...dimensions } : null;
  }
  if (isWebp(bytes)) {
    const dimensions = readWebpDimensions(bytes);
    return dimensions ? { contentType: 'image/webp', extension: 'webp', ...dimensions } : null;
  }
  return null;
}

export function assertFreeImageDimensions(width: number, height: number): void {
  const pixels = width * height;
  if (
    width < MIN_IMAGE_DIMENSION ||
    height < MIN_IMAGE_DIMENSION ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new AppError(
      'validation_error',
      `Dimensiones no permitidas: ${width}×${height}px. Cada lado debe medir entre ${MIN_IMAGE_DIMENSION} y ${MAX_IMAGE_DIMENSION}px y la imagen no puede superar ${MAX_IMAGE_PIXELS.toLocaleString('es-MX')} píxeles.`,
    );
  }
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return (
    bytes.length >= 24 &&
    signature.every((value, index) => bytes[index] === value) &&
    ascii(bytes, 12, 4) === 'IHDR'
  );
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const width = readUint32Be(bytes, 16);
  const height = readUint32Be(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = readUint16Be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = readUint16Be(bytes, offset + 3);
      const width = readUint16Be(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  );
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, 4);
    const chunkSize = readUint32Le(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) return null;

    if (chunkType === 'VP8X' && chunkSize >= 10) {
      return {
        width: readUint24Le(bytes, dataOffset + 4) + 1,
        height: readUint24Le(bytes, dataOffset + 7) + 1,
      };
    }
    if (
      chunkType === 'VP8 ' &&
      chunkSize >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      return {
        width: readUint16Le(bytes, dataOffset + 6) & 0x3fff,
        height: readUint16Le(bytes, dataOffset + 8) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L' && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
      const packed =
        ((bytes[dataOffset + 1] ?? 0) |
          ((bytes[dataOffset + 2] ?? 0) << 8) |
          ((bytes[dataOffset + 3] ?? 0) << 16) |
          ((bytes[dataOffset + 4] ?? 0) << 24)) >>>
        0;
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
      };
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return value;
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}
