import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const SCREEN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const FRAME_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const IMAGE_FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.(?:jpe?g|png|webp)$/i;

export class CaptureStoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CaptureStoreError';
    this.status = status;
    this.code = code;
  }
}

export async function readCaptureManifest({ designsRoot, projectId }) {
  assertProjectId(projectId);
  if (!designsRoot || !path.isAbsolute(designsRoot)) {
    throw new CaptureStoreError(503, 'capture_store_unavailable', 'El almacén visual no está configurado.');
  }

  const directory = path.join(designsRoot, projectId, 'captures', 'current');
  let payload;
  try {
    payload = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return emptyManifest(projectId);
    }
    if (error instanceof SyntaxError) {
      throw new CaptureStoreError(500, 'invalid_capture_manifest', 'El manifiesto de capturas es inválido.');
    }
    throw error;
  }

  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    payload.projectId !== projectId ||
    !Array.isArray(payload.captures)
  ) {
    throw new CaptureStoreError(500, 'invalid_capture_manifest', 'El manifiesto de capturas no coincide con el proyecto.');
  }

  const root = await realpath(directory);
  const captures = [];
  for (const entry of payload.captures) {
    validateEntry(entry);
    const imagePath = await realpath(path.join(root, entry.file));
    const relative = path.relative(root, imagePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new CaptureStoreError(403, 'capture_outside_store', 'Una captura está fuera del almacén visual.');
    }
    const image = await stat(imagePath);
    if (!image.isFile()) {
      throw new CaptureStoreError(404, 'capture_not_found', 'La captura solicitada no existe.');
    }
    captures.push({
      screenId: entry.screenId,
      frameId: normalizeFrameId(entry.frameId),
      route: entry.route,
      width: entry.width,
      height: entry.height,
      capturedAt: entry.capturedAt,
      file: entry.file,
      imagePath,
    });
  }

  return {
    schemaVersion: 1,
    projectId,
    source: typeof payload.source === 'string' ? payload.source : 'browser-real',
    baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl : null,
    capturedAt: typeof payload.capturedAt === 'string' ? payload.capturedAt : null,
    captures,
  };
}

export async function readCaptureAsset({ designsRoot, projectId, screenId, frameId = 'primary' }) {
  if (typeof screenId !== 'string' || !SCREEN_ID_PATTERN.test(screenId)) {
    throw new CaptureStoreError(422, 'invalid_screen_id', 'screenId es inválido.');
  }
  const normalizedFrameId = normalizeFrameId(frameId);
  assertFrameId(normalizedFrameId);
  const manifest = await readCaptureManifest({ designsRoot, projectId });
  const capture = manifest.captures.find(
    (entry) => entry.screenId === screenId && entry.frameId === normalizedFrameId,
  );
  if (!capture) {
    throw new CaptureStoreError(404, 'capture_not_found', 'La pantalla no tiene una captura real.');
  }
  const extension = path.extname(capture.file).toLowerCase();
  const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
  return { contentType, body: await readFile(capture.imagePath) };
}

export async function saveCaptureAsset({
  designsRoot,
  projectId,
  screenId,
  frameId = 'primary',
  route,
  body,
  contentType,
  width,
  height,
  baseUrl,
  source = 'browser-local',
  capturedAt = new Date().toISOString(),
}) {
  assertProjectId(projectId);
  if (!designsRoot || !path.isAbsolute(designsRoot)) {
    throw new CaptureStoreError(503, 'capture_store_unavailable', 'El almacén visual no está configurado.');
  }
  if (typeof screenId !== 'string' || !SCREEN_ID_PATTERN.test(screenId)) {
    throw new CaptureStoreError(422, 'invalid_screen_id', 'screenId es inválido.');
  }
  const normalizedFrameId = normalizeFrameId(frameId);
  assertFrameId(normalizedFrameId);
  if (typeof route !== 'string' || !route.startsWith('/')) {
    throw new CaptureStoreError(422, 'invalid_capture_route', 'La ruta de captura es inválida.');
  }
  if (!Buffer.isBuffer(body) || body.length < 8) {
    throw new CaptureStoreError(422, 'invalid_capture_image', 'La captura no contiene una imagen válida.');
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new CaptureStoreError(415, 'unsupported_capture_type', 'El formato de captura no está permitido.');
  }
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new CaptureStoreError(422, 'invalid_capture_dimensions', 'Las dimensiones de captura son inválidas.');
  }

  const directory = path.join(designsRoot, projectId, 'captures', 'current');
  await mkdir(directory, { recursive: true });
  const extension = contentType === 'image/png' ? '.png' : contentType === 'image/webp' ? '.webp' : '.jpg';
  const suffix = normalizedFrameId === 'primary' ? '' : `--${normalizedFrameId}`;
  const version = `${capturedAt.replace(/\D/g, '').slice(0, 17)}-${crypto.randomUUID().slice(0, 8)}`;
  const file = `${screenId}${suffix}--${version}${extension}`;
  const targetPath = path.join(directory, file);
  const imageTempPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(imageTempPath, body, { flag: 'wx' });
  await rename(imageTempPath, targetPath);

  const previous = await readManifestFile(directory, projectId);
  const captures = previous.captures.filter(
    (entry) =>
      entry.screenId !== screenId || normalizeFrameId(entry.frameId) !== normalizedFrameId,
  );
  captures.push({
    screenId,
    frameId: normalizedFrameId,
    route,
    file,
    width,
    height,
    capturedAt,
  });
  captures.sort((left, right) =>
    `${left.screenId}:${normalizeFrameId(left.frameId)}`.localeCompare(
      `${right.screenId}:${normalizeFrameId(right.frameId)}`,
    ),
  );
  const manifest = {
    schemaVersion: 1,
    projectId,
    source,
    baseUrl: typeof baseUrl === 'string' ? baseUrl : previous.baseUrl ?? null,
    capturedAt,
    captures,
  };
  await writeJsonAtomic(path.join(directory, 'manifest.json'), manifest);

  const oldEntry = previous.captures.find(
    (entry) =>
      entry.screenId === screenId &&
      normalizeFrameId(entry.frameId) === normalizedFrameId &&
      entry.file !== file,
  );
  if (oldEntry && IMAGE_FILE_PATTERN.test(oldEntry.file)) {
    await rm(path.join(directory, oldEntry.file), { force: true });
  }

  return {
    screenId,
    frameId: normalizedFrameId,
    route,
    width,
    height,
    capturedAt,
    file,
    imagePath: targetPath,
  };
}

function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new CaptureStoreError(422, 'invalid_project_id', 'projectId es inválido.');
  }
}

function validateEntry(entry) {
  if (
    !entry ||
    typeof entry !== 'object' ||
    typeof entry.screenId !== 'string' ||
    !SCREEN_ID_PATTERN.test(entry.screenId) ||
    (entry.frameId !== undefined &&
      (typeof entry.frameId !== 'string' || !FRAME_ID_PATTERN.test(entry.frameId))) ||
    typeof entry.route !== 'string' ||
    !entry.route.startsWith('/') ||
    typeof entry.file !== 'string' ||
    !IMAGE_FILE_PATTERN.test(entry.file) ||
    path.basename(entry.file) !== entry.file ||
    !Number.isInteger(entry.width) ||
    entry.width < 1 ||
    !Number.isInteger(entry.height) ||
    entry.height < 1 ||
    typeof entry.capturedAt !== 'string'
  ) {
    throw new CaptureStoreError(500, 'invalid_capture_manifest', 'Una entrada del manifiesto de capturas es inválida.');
  }
}

function normalizeFrameId(frameId) {
  return !frameId || frameId === 'default' ? 'primary' : frameId;
}

function assertFrameId(frameId) {
  if (typeof frameId !== 'string' || !FRAME_ID_PATTERN.test(frameId)) {
    throw new CaptureStoreError(422, 'invalid_frame_id', 'frameId es inválido.');
  }
}

async function readManifestFile(directory, projectId) {
  try {
    const payload = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    if (
      payload?.schemaVersion === 1 &&
      payload.projectId === projectId &&
      Array.isArray(payload.captures)
    ) {
      payload.captures.forEach(validateEntry);
      return payload;
    }
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  return emptyManifest(projectId);
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    if (!error || typeof error !== 'object' || !['EPERM', 'EEXIST'].includes(error.code)) throw error;
    await rm(filePath, { force: true });
    await rename(tempPath, filePath);
  }
}

function emptyManifest(projectId) {
  return {
    schemaVersion: 1,
    projectId,
    source: null,
    baseUrl: null,
    capturedAt: null,
    captures: [],
  };
}
