import { z } from 'zod';

export const SITE_DOC_ACCESS_LEVELS = ['public', 'private'] as const;
export const SITE_DOC_EXTENSIONS = [
  'pdf',
  'jpg',
  'png',
  'webp',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'txt',
] as const;
export const SITE_DOC_IMAGE_EXTENSIONS = ['jpg', 'png', 'webp'] as const;
export const SITE_DOC_MAX_BYTES = 25 * 1024 * 1024;
export const SITE_DOC_MAX_TEXT_BYTES = 5 * 1024 * 1024;

export type SiteDocExtension = (typeof SITE_DOC_EXTENSIONS)[number];
export type SiteDocRejectionCode =
  | 'empty_file'
  | 'file_too_large'
  | 'invalid_filename'
  | 'path_like_filename'
  | 'double_extension'
  | 'extension_not_allowed'
  | 'mime_mismatch'
  | 'signature_mismatch'
  | 'active_content'
  | 'office_package_invalid'
  | 'office_macro_or_embedding'
  | 'archive_not_allowed'
  | 'storage_failed';

export interface SiteDocValidationReport {
  validator: 'worker-immediate-signature-v1';
  extension: SiteDocExtension;
  declaredMime: string;
  detectedMime: string;
  checks: string[];
  officeKind: 'word' | 'spreadsheet' | 'presentation' | null;
  deepAntivirusScan: 'not-performed-worker-mvp';
}

export const SITE_DOC_MIME_BY_EXTENSION: Readonly<Record<SiteDocExtension, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
};

const projectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Id de proyecto inválido (usa letras, números, punto, guion o guion bajo).',
  );

const docIdSchema = z.string().uuid('Id de documento inválido.');
const categoryIdSchema = z.string().uuid('Id de categoría inválido.');

const boundedMetadataSchema = z.record(z.string(), z.unknown()).refine((value) => {
  try {
    return JSON.stringify(value).length <= 50_000;
  } catch {
    return false;
  }
}, 'Los metadatos exceden el tamaño permitido o no son serializables.');

const optionalDescriptionSchema = z
  .string()
  .trim()
  .max(2_000)
  .transform((value) => value || null)
  .nullable()
  .optional();

export const siteDocsProjectIdSchema = projectIdSchema;
export const siteDocIdSchema = docIdSchema;

export const createSiteDocCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug de categoría inválido.'),
    description: optionalDescriptionSchema,
    sortOrder: z.coerce.number().int().min(-10_000).max(10_000).default(0),
  })
  .strict();

export const updateSiteDocCategorySchema = createSiteDocCategorySchema.partial().strict();

const nullableCategorySchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  categoryIdSchema.nullable(),
);

const multipartBooleanSchema = z.preprocess((value) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}, z.boolean());

const multipartMetadataSchema = z.preprocess((value) => {
  if (value === undefined || value === '' || value === null) return {};
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}, boundedMetadataSchema);

export const createSiteDocUploadSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: optionalDescriptionSchema,
    categoryId: nullableCategorySchema.default(null),
    accessLevel: z.enum(SITE_DOC_ACCESS_LEVELS).default('private'),
    downloadEnabled: multipartBooleanSchema.default(true),
    sortOrder: z.coerce.number().int().min(-10_000).max(10_000).default(0),
    metadata: multipartMetadataSchema.default({}),
  })
  .strict();

export const updateSiteDocSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    categoryId: categoryIdSchema.nullable().optional(),
    accessLevel: z.enum(SITE_DOC_ACCESS_LEVELS).optional(),
    downloadEnabled: z.boolean().optional(),
    sortOrder: z.number().int().min(-10_000).max(10_000).optional(),
    metadata: boundedMetadataSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios para guardar.');

export const publishSiteDocSchema = z
  .object({
    reason: z.string().trim().max(1_000).nullish(),
  })
  .strict();

export type CreateSiteDocCategoryInput = z.infer<typeof createSiteDocCategorySchema>;
export type UpdateSiteDocCategoryInput = z.infer<typeof updateSiteDocCategorySchema>;
export type CreateSiteDocUploadInput = z.infer<typeof createSiteDocUploadSchema>;
export type UpdateSiteDocInput = z.infer<typeof updateSiteDocSchema>;

export interface SiteDocUploadLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface AcceptedSiteDocInspection {
  accepted: true;
  fileName: string;
  extension: SiteDocExtension;
  declaredMime: string;
  detectedMime: string;
  report: SiteDocValidationReport;
}

export interface RejectedSiteDocInspection {
  accepted: false;
  fileName: string;
  extension: SiteDocExtension | null;
  declaredMime: string;
  code: SiteDocRejectionCode;
  reason: string;
}

export type SiteDocInspection = AcceptedSiteDocInspection | RejectedSiteDocInspection;

const BLOCKED_MIME_MARKERS = [
  'text/html',
  'image/svg',
  'javascript',
  'ecmascript',
  'application/zip',
  'application/x-7z',
  'application/x-rar',
  'application/x-tar',
  'application/gzip',
  'application/x-msdownload',
  'application/x-sh',
];

const ACTIVE_TEXT_MARKERS = [
  '<!doctype html',
  '<html',
  '<script',
  '<svg',
  '<iframe',
  '<?xml',
  'javascript:',
  'vbscript:',
];

const ACTIVE_PDF_MARKERS = [
  '/javascript',
  '/js',
  '/launch',
  '/richmedia',
  '/embeddedfile',
  '/openaction',
  '/aa',
];

const BLOCKED_OFFICE_ENTRY_MARKERS = [
  'vbaproject',
  '/macros/',
  '/activex/',
  '/embeddings/',
  '/oleobject',
  '/externallinks/',
  '/customui/',
];

const BLOCKED_ARCHIVE_ENTRY_EXTENSIONS = [
  '.exe',
  '.dll',
  '.js',
  '.jse',
  '.mjs',
  '.cjs',
  '.vbs',
  '.vbe',
  '.ps1',
  '.psm1',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.hta',
  '.html',
  '.htm',
  '.svg',
  '.sh',
  '.jar',
  '.lnk',
  '.reg',
  '.chm',
  '.bin',
  '.iso',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
];

export function siteDocCandidateExtension(fileName: string): SiteDocExtension | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName.trim());
  if (!match) return null;
  const candidate = match[1]?.toLowerCase();
  return SITE_DOC_EXTENSIONS.find((extension) => extension === candidate) ?? null;
}

/** Solo para mostrar un intento rechazado; nunca se usa para construir una key. */
export function sanitizeUntrustedSiteDocFilename(fileName: string): string {
  const normalized = fileName
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:<>"]/g, '-')
    .trim()
    .slice(0, 180);
  return normalized || 'archivo-rechazado';
}

export async function inspectSiteDocUpload(file: SiteDocUploadLike): Promise<SiteDocInspection> {
  const declaredMime = file.type.trim().toLowerCase();
  const displayName = sanitizeUntrustedSiteDocFilename(file.name);
  const nameResult = inspectFileName(file.name);
  if (!nameResult.ok) {
    return {
      accepted: false,
      fileName: displayName,
      extension: siteDocCandidateExtension(file.name),
      declaredMime,
      code: nameResult.code,
      reason: nameResult.reason,
    };
  }

  const extension = nameResult.extension;
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return rejected(displayName, extension, declaredMime, 'empty_file', 'El archivo está vacío.');
  }

  const maxBytes =
    extension === 'csv' || extension === 'txt' ? SITE_DOC_MAX_TEXT_BYTES : SITE_DOC_MAX_BYTES;
  if (file.size > maxBytes) {
    return rejected(
      displayName,
      extension,
      declaredMime,
      'file_too_large',
      `El archivo excede el límite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    );
  }

  if (BLOCKED_MIME_MARKERS.some((marker) => declaredMime.includes(marker))) {
    return rejected(
      displayName,
      extension,
      declaredMime,
      'mime_mismatch',
      'El MIME declarado corresponde a contenido activo, ejecutable o comprimido.',
    );
  }

  const expectedMime = SITE_DOC_MIME_BY_EXTENSION[extension];
  if (declaredMime !== expectedMime) {
    return rejected(
      displayName,
      extension,
      declaredMime,
      'mime_mismatch',
      `El MIME declarado no coincide con .${extension}.`,
    );
  }

  const bytes =
    extension === 'docx' ||
    extension === 'xlsx' ||
    extension === 'pptx' ||
    extension === 'pdf' ||
    extension === 'csv' ||
    extension === 'txt'
      ? new Uint8Array(await file.arrayBuffer())
      : new Uint8Array(await file.slice(0, Math.min(file.size, 16_384)).arrayBuffer());

  const signature = inspectSignature(extension, bytes, file.size);
  if (!signature.ok) {
    return rejected(displayName, extension, declaredMime, signature.code, signature.reason);
  }

  return {
    accepted: true,
    fileName: displayName,
    extension,
    declaredMime,
    detectedMime: expectedMime,
    report: {
      validator: 'worker-immediate-signature-v1',
      extension,
      declaredMime,
      detectedMime: expectedMime,
      checks: signature.checks,
      officeKind: signature.officeKind,
      deepAntivirusScan: 'not-performed-worker-mvp',
    },
  };
}

type FileNameInspection =
  | { ok: true; extension: SiteDocExtension }
  | {
      ok: false;
      code:
        | 'invalid_filename'
        | 'path_like_filename'
        | 'double_extension'
        | 'extension_not_allowed';
      reason: string;
    };

function inspectFileName(rawName: string): FileNameInspection {
  const fileName = rawName.trim();
  if (
    !fileName ||
    fileName.length > 180 ||
    fileName !== rawName ||
    /[\u0000-\u001f\u007f]/.test(fileName) ||
    fileName.startsWith('.') ||
    fileName.endsWith('.') ||
    fileName.endsWith(' ')
  ) {
    return { ok: false, code: 'invalid_filename', reason: 'El nombre del archivo no es válido.' };
  }

  if (/[\\/:%?#]/.test(fileName) || fileName.includes('..') || /%2e|%2f|%5c/i.test(fileName)) {
    return {
      ok: false,
      code: 'path_like_filename',
      reason: 'El nombre no puede parecer una ruta o URL.',
    };
  }

  const segments = fileName.split('.');
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    return {
      ok: false,
      code: segments.length > 2 ? 'double_extension' : 'invalid_filename',
      reason:
        segments.length > 2
          ? 'No se permiten extensiones dobles.'
          : 'El archivo debe tener una extensión explícita.',
    };
  }

  const extension = siteDocCandidateExtension(fileName);
  if (!extension) {
    return {
      ok: false,
      code: 'extension_not_allowed',
      reason: 'La extensión no pertenece a la allowlist de DOCS.',
    };
  }
  return { ok: true, extension };
}

type SignatureInspection =
  | {
      ok: true;
      checks: string[];
      officeKind: 'word' | 'spreadsheet' | 'presentation' | null;
    }
  | {
      ok: false;
      code:
        | 'signature_mismatch'
        | 'active_content'
        | 'office_package_invalid'
        | 'office_macro_or_embedding'
        | 'archive_not_allowed';
      reason: string;
    };

function inspectSignature(
  extension: SiteDocExtension,
  bytes: Uint8Array,
  totalSize: number,
): SignatureInspection {
  if (extension === 'jpg') {
    if (!startsWith(bytes, [0xff, 0xd8, 0xff])) return signatureMismatch('JPEG');
    return acceptedSignature(['extension', 'mime', 'jpeg-soi'], null);
  }
  if (extension === 'png') {
    if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      return signatureMismatch('PNG');
    }
    if (asciiAt(bytes, 12, 4) !== 'IHDR') return signatureMismatch('PNG/IHDR');
    return acceptedSignature(['extension', 'mime', 'png-signature', 'png-ihdr'], null);
  }
  if (extension === 'webp') {
    if (asciiAt(bytes, 0, 4) !== 'RIFF' || asciiAt(bytes, 8, 4) !== 'WEBP') {
      return signatureMismatch('WebP');
    }
    if (bytes.length >= 8 && readUint32(bytes, 4) + 8 !== totalSize) {
      return signatureMismatch('WebP/RIFF-size');
    }
    return acceptedSignature(['extension', 'mime', 'webp-riff'], null);
  }
  if (extension === 'pdf') return inspectPdf(bytes);
  if (extension === 'txt' || extension === 'csv') return inspectPlainText(bytes, extension);
  return inspectOfficePackage(bytes, extension);
}

function inspectPdf(bytes: Uint8Array): SignatureInspection {
  if (asciiAt(bytes, 0, 5) !== '%PDF-') return signatureMismatch('PDF');
  const ascii = asciiLower(bytes);
  if (!ascii.slice(Math.max(0, ascii.length - 2_048)).includes('%%eof')) {
    return signatureMismatch('PDF/EOF');
  }
  if (ACTIVE_PDF_MARKERS.some((marker) => ascii.includes(marker))) {
    return {
      ok: false,
      code: 'active_content',
      reason: 'El PDF contiene acciones, JavaScript o adjuntos activos no permitidos.',
    };
  }
  return acceptedSignature(
    ['extension', 'mime', 'pdf-header', 'pdf-eof', 'pdf-no-active-markers'],
    null,
  );
}

function inspectPlainText(bytes: Uint8Array, extension: 'txt' | 'csv'): SignatureInspection {
  if (!isValidUtf8(bytes)) return signatureMismatch(`${extension.toUpperCase()}/UTF-8`);
  const ascii = asciiLower(bytes);
  if (ACTIVE_TEXT_MARKERS.some((marker) => ascii.includes(marker))) {
    return {
      ok: false,
      code: 'active_content',
      reason: 'El texto contiene marcado o protocolos de contenido activo.',
    };
  }
  return acceptedSignature(['extension', 'mime', 'utf8-text', 'no-html-svg-script-markers'], null);
}

function inspectOfficePackage(
  bytes: Uint8Array,
  extension: 'docx' | 'xlsx' | 'pptx',
): SignatureInspection {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return signatureMismatch('ZIP/OOXML');
  }

  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0 || eocdOffset + 22 > bytes.length) {
    return {
      ok: false,
      code: 'office_package_invalid',
      reason: 'No se encontró un directorio central OOXML válido.',
    };
  }

  const disk = readUint16(bytes, eocdOffset + 4);
  const centralDisk = readUint16(bytes, eocdOffset + 6);
  const entriesOnDisk = readUint16(bytes, eocdOffset + 8);
  const entryCount = readUint16(bytes, eocdOffset + 10);
  const centralSize = readUint32(bytes, eocdOffset + 12);
  const centralOffset = readUint32(bytes, eocdOffset + 16);
  const commentLength = readUint16(bytes, eocdOffset + 20);

  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0 ||
    entryCount === 0xffff ||
    entryCount > 10_000 ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    centralOffset + centralSize !== eocdOffset ||
    eocdOffset + 22 + commentLength !== bytes.length
  ) {
    return {
      ok: false,
      code: 'office_package_invalid',
      reason: 'El paquete OOXML usa una estructura ZIP no permitida.',
    };
  }

  const names: string[] = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;
  let totalCompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, cursor) !== 0x02014b50 || cursor + 46 > eocdOffset) {
      return invalidOfficeDirectory();
    }
    const flags = readUint16(bytes, cursor + 8);
    const compression = readUint16(bytes, cursor + 10);
    const compressedSize = readUint32(bytes, cursor + 20);
    const uncompressedSize = readUint32(bytes, cursor + 24);
    const fileNameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const entryCommentLength = readUint16(bytes, cursor + 32);
    const localOffset = readUint32(bytes, cursor + 42);
    const entryEnd = cursor + 46 + fileNameLength + extraLength + entryCommentLength;

    if (
      entryEnd > eocdOffset ||
      (flags & 0x0001) !== 0 ||
      (compression !== 0 && compression !== 8) ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset + 30 > centralOffset ||
      readUint32(bytes, localOffset) !== 0x04034b50
    ) {
      return {
        ok: false,
        code:
          compression !== 0 && compression !== 8 ? 'archive_not_allowed' : 'office_package_invalid',
        reason: 'El paquete OOXML contiene cifrado, Zip64 o compresión no permitida.',
      };
    }

    const name = decodeAsciiEntryName(bytes, cursor + 46, fileNameLength);
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
      return {
        ok: false,
        code: 'office_package_invalid',
        reason: 'El paquete OOXML contiene una ruta interna inválida.',
      };
    }

    const lowerName = name.toLowerCase();
    if (
      BLOCKED_OFFICE_ENTRY_MARKERS.some((marker) => lowerName.includes(marker)) ||
      BLOCKED_ARCHIVE_ENTRY_EXTENSIONS.some((suffix) => lowerName.endsWith(suffix))
    ) {
      return {
        ok: false,
        code: 'office_macro_or_embedding',
        reason: 'El Office contiene macros, scripts, enlaces activos, embebidos o archives.',
      };
    }

    if (compressedSize > 0 && uncompressedSize / compressedSize > 250) {
      return {
        ok: false,
        code: 'office_package_invalid',
        reason: 'El paquete OOXML excede la relación de compresión permitida.',
      };
    }

    names.push(lowerName);
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    cursor = entryEnd;
  }

  if (
    cursor !== eocdOffset ||
    totalUncompressed > 250 * 1024 * 1024 ||
    (totalCompressed > 0 && totalUncompressed / totalCompressed > 200)
  ) {
    return invalidOfficeDirectory();
  }

  if (!names.includes('[content_types].xml') || !names.includes('_rels/.rels')) {
    return {
      ok: false,
      code: 'office_package_invalid',
      reason: 'Faltan manifiestos obligatorios del paquete OOXML.',
    };
  }

  const requiredEntry =
    extension === 'docx'
      ? 'word/document.xml'
      : extension === 'xlsx'
        ? 'xl/workbook.xml'
        : 'ppt/presentation.xml';
  if (!names.includes(requiredEntry)) {
    return {
      ok: false,
      code: 'office_package_invalid',
      reason: `La firma OOXML no coincide con .${extension}.`,
    };
  }

  const rawAscii = asciiLower(bytes);
  if (rawAscii.includes('macroenabled') || rawAscii.includes('vbaproject')) {
    return {
      ok: false,
      code: 'office_macro_or_embedding',
      reason: 'El paquete Office declara contenido habilitado para macros.',
    };
  }

  const officeKind =
    extension === 'docx' ? 'word' : extension === 'xlsx' ? 'spreadsheet' : 'presentation';
  return acceptedSignature(
    [
      'extension',
      'mime',
      'zip-central-directory',
      'ooxml-required-parts',
      'no-macro-script-archive-entries',
      'bounded-expansion',
    ],
    officeKind,
  );
}

function rejected(
  fileName: string,
  extension: SiteDocExtension | null,
  declaredMime: string,
  code: SiteDocRejectionCode,
  reason: string,
): RejectedSiteDocInspection {
  return { accepted: false, fileName, extension, declaredMime, code, reason };
}

function acceptedSignature(
  checks: string[],
  officeKind: 'word' | 'spreadsheet' | 'presentation' | null,
): SignatureInspection {
  return { ok: true, checks, officeKind };
}

function signatureMismatch(expected: string): SignatureInspection {
  return {
    ok: false,
    code: 'signature_mismatch',
    reason: `Los bytes no contienen una firma ${expected} válida.`,
  };
}

function invalidOfficeDirectory(): SignatureInspection {
  return {
    ok: false,
    code: 'office_package_invalid',
    reason: 'El directorio central del paquete OOXML es inconsistente.',
  };
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let output = '';
  for (let index = offset; index < offset + length && index < bytes.length; index += 1) {
    output += String.fromCharCode(bytes[index] ?? 0);
  }
  return output;
}

function asciiLower(bytes: Uint8Array): string {
  let output = '';
  const chunkSize = 8_192;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const end = Math.min(bytes.length, start + chunkSize);
    let chunk = '';
    for (let index = start; index < end; index += 1) {
      const value = bytes[index] ?? 0;
      chunk += value >= 32 && value <= 126 ? String.fromCharCode(value) : ' ';
    }
    output += chunk.toLowerCase();
  }
  return output;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return -1;
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return -1;
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function decodeAsciiEntryName(bytes: Uint8Array, offset: number, length: number): string | null {
  if (length <= 0 || offset + length > bytes.length) return null;
  let value = '';
  for (let index = offset; index < offset + length; index += 1) {
    const byte = bytes[index] ?? 0;
    if (byte < 0x20 || byte > 0x7e) return null;
    value += String.fromCharCode(byte);
  }
  return value;
}

function isValidUtf8(bytes: Uint8Array): boolean {
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index] ?? 0;
    if (first === 0) return false;
    if (first <= 0x7f) continue;

    let continuationCount = 0;
    let minimum = 0;
    let codePoint = 0;
    if (first >= 0xc2 && first <= 0xdf) {
      continuationCount = 1;
      minimum = 0x80;
      codePoint = first & 0x1f;
    } else if (first >= 0xe0 && first <= 0xef) {
      continuationCount = 2;
      minimum = 0x800;
      codePoint = first & 0x0f;
    } else if (first >= 0xf0 && first <= 0xf4) {
      continuationCount = 3;
      minimum = 0x10000;
      codePoint = first & 0x07;
    } else {
      return false;
    }

    if (index + continuationCount >= bytes.length) return false;
    for (let offset = 1; offset <= continuationCount; offset += 1) {
      const next = bytes[index + offset] ?? 0;
      if ((next & 0xc0) !== 0x80) return false;
      codePoint = (codePoint << 6) | (next & 0x3f);
    }

    if (
      codePoint < minimum ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return false;
    }
    index += continuationCount;
  }
  return true;
}

export function isSiteDocImageExtension(
  extension: SiteDocExtension | null,
): extension is (typeof SITE_DOC_IMAGE_EXTENSIONS)[number] {
  return (
    extension !== null && SITE_DOC_IMAGE_EXTENSIONS.some((candidate) => candidate === extension)
  );
}
