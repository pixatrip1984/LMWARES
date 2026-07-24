import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const SCREEN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const FRAME_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const IMAGE_FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.(?:jpe?g|png|webp)$/i;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export class DesignStoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'DesignStoreError';
    this.status = status;
    this.code = code;
  }
}

export async function readTargetManifest({ designsRoot, projectId }) {
  assertStore(designsRoot);
  assertId(projectId, PROJECT_ID_PATTERN, 'projectId');
  const directory = path.join(designsRoot, projectId, 'targets');
  const manifestPath = path.join(directory, 'manifest.json');
  let payload;
  try {
    payload = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return emptyManifest(projectId);
    }
    if (error instanceof SyntaxError) {
      throw new DesignStoreError(500, 'invalid_target_manifest', 'El manifiesto de objetivos es inválido.');
    }
    throw error;
  }

  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    payload.projectId !== projectId ||
    !Array.isArray(payload.targets)
  ) {
    throw new DesignStoreError(500, 'invalid_target_manifest', 'El manifiesto de objetivos no coincide con el proyecto.');
  }

  const targets = [];
  for (const entry of payload.targets) {
    validateTargetEntry(entry);
    const imagePath = path.resolve(directory, entry.file);
    assertContained(directory, imagePath);
    let image;
    try {
      image = await stat(imagePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new DesignStoreError(404, 'target_not_found', 'Una imagen objetivo registrada no existe.');
      }
      throw error;
    }
    if (!image.isFile()) {
      throw new DesignStoreError(404, 'target_not_found', 'Una imagen objetivo registrada no existe.');
    }
    targets.push({ ...entry, frameId: normalizeFrameId(entry.frameId), imagePath });
  }

  return {
    schemaVersion: 1,
    projectId,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    targets,
  };
}

export async function readLatestTargets(options) {
  const manifest = await readTargetManifest(options);
  const latest = new Map();
  for (const target of manifest.targets) {
    const key = `${target.screenId}:${target.frameId}`;
    const current = latest.get(key);
    if (!current || target.version > current.version) latest.set(key, target);
  }
  return { ...manifest, targets: [...latest.values()] };
}

export async function readTargetAsset({ designsRoot, projectId, screenId, frameId = 'primary', version }) {
  assertId(screenId, SCREEN_ID_PATTERN, 'screenId');
  assertId(normalizeFrameId(frameId), FRAME_ID_PATTERN, 'frameId');
  const manifest = await readTargetManifest({ designsRoot, projectId });
  const matches = manifest.targets.filter(
    (target) => target.screenId === screenId && target.frameId === normalizeFrameId(frameId),
  );
  const target = Number.isInteger(version)
    ? matches.find((entry) => entry.version === version)
    : matches.sort((left, right) => right.version - left.version)[0];
  if (!target) {
    throw new DesignStoreError(404, 'target_not_found', 'La pantalla no tiene una imagen objetivo.');
  }
  return {
    contentType: target.contentType,
    body: await readFile(target.imagePath),
    target,
  };
}

export async function saveTargetAsset({
  designsRoot,
  projectId,
  screenId,
  frameId = 'primary',
  body,
  contentType,
  source,
  promptSha256 = null,
  threadId = null,
  createdAt = new Date().toISOString(),
}) {
  assertStore(designsRoot);
  assertId(projectId, PROJECT_ID_PATTERN, 'projectId');
  assertId(screenId, SCREEN_ID_PATTERN, 'screenId');
  frameId = normalizeFrameId(frameId);
  assertId(frameId, FRAME_ID_PATTERN, 'frameId');
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) {
    throw new DesignStoreError(422, 'invalid_target_image', 'La imagen objetivo es inválida o excede 12 MiB.');
  }
  if (source !== 'imagegen' && source !== 'uploaded') {
    throw new DesignStoreError(422, 'invalid_target_source', 'El origen de la imagen objetivo es inválido.');
  }

  const detected = inspectImage(body);
  if (contentType && contentType !== detected.contentType) {
    throw new DesignStoreError(422, 'invalid_target_image', 'El contenido no coincide con el tipo de imagen.');
  }

  const directory = path.join(designsRoot, projectId, 'targets');
  const screenDirectory =
    frameId === 'primary' ? path.join(directory, screenId) : path.join(directory, screenId, frameId);
  await mkdir(screenDirectory, { recursive: true });
  const current = await readTargetManifest({ designsRoot, projectId });
  const version = Math.max(
    0,
    ...current.targets
      .filter((entry) => entry.screenId === screenId && entry.frameId === frameId)
      .map((entry) => entry.version),
  ) + 1;
  const frameDirectory = frameId === 'primary' ? screenId : `${screenId}/${frameId}`;
  const relativeFile = `${frameDirectory}/v${String(version).padStart(3, '0')}.${detected.extension}`;
  const finalPath = path.join(directory, relativeFile);
  const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, body, { flag: 'wx' });
  await rename(temporaryPath, finalPath);

  const entry = {
    screenId,
    frameId,
    version,
    file: relativeFile.replaceAll('\\', '/'),
    width: detected.width,
    height: detected.height,
    contentType: detected.contentType,
    source,
    createdAt,
    promptSha256,
    threadId,
  };
  const updated = {
    schemaVersion: 1,
    projectId,
    updatedAt: createdAt,
    targets: [...current.targets.map(({ imagePath: _imagePath, ...target }) => target), entry],
  };
  await writeJsonAtomic(path.join(directory, 'manifest.json'), updated);
  return { ...entry, imagePath: finalPath };
}

export function inspectImage(body) {
  if (body.length >= 24 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    const width = body.readUInt32BE(16);
    const height = body.readUInt32BE(20);
    assertDimensions(width, height);
    return { contentType: 'image/png', extension: 'png', width, height };
  }
  if (body.length >= 4 && body[0] === 0xff && body[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < body.length) {
      if (body[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = body[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = body.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > body.length) break;
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = body.readUInt16BE(offset + 5);
        const width = body.readUInt16BE(offset + 7);
        assertDimensions(width, height);
        return { contentType: 'image/jpeg', extension: 'jpg', width, height };
      }
      offset += length + 2;
    }
  }
  throw new DesignStoreError(415, 'unsupported_target_image', 'Solo se admiten imágenes PNG o JPEG válidas.');
}

function assertDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 8192 || height > 8192) {
    throw new DesignStoreError(422, 'invalid_target_dimensions', 'Las dimensiones de la imagen objetivo no son válidas.');
  }
}

function validateTargetEntry(entry) {
  if (
    !entry ||
    typeof entry !== 'object' ||
    typeof entry.screenId !== 'string' ||
    !SCREEN_ID_PATTERN.test(entry.screenId) ||
    (entry.frameId !== undefined &&
      (typeof entry.frameId !== 'string' || !FRAME_ID_PATTERN.test(normalizeFrameId(entry.frameId)))) ||
    !Number.isInteger(entry.version) ||
    entry.version < 1 ||
    typeof entry.file !== 'string' ||
    !IMAGE_FILE_PATTERN.test(path.basename(entry.file)) ||
    path.isAbsolute(entry.file) ||
    entry.file.includes('..') ||
    !Number.isInteger(entry.width) ||
    !Number.isInteger(entry.height) ||
    (entry.contentType !== 'image/png' && entry.contentType !== 'image/jpeg') ||
    (entry.source !== 'imagegen' && entry.source !== 'uploaded') ||
    typeof entry.createdAt !== 'string' ||
    (entry.promptSha256 !== null && typeof entry.promptSha256 !== 'string') ||
    (entry.threadId !== null && typeof entry.threadId !== 'string')
  ) {
    throw new DesignStoreError(500, 'invalid_target_manifest', 'Una entrada del manifiesto de objetivos es inválida.');
  }
}

function assertStore(designsRoot) {
  if (!designsRoot || !path.isAbsolute(designsRoot)) {
    throw new DesignStoreError(503, 'target_store_unavailable', 'El almacén visual no está configurado.');
  }
}

function assertId(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new DesignStoreError(422, `invalid_${label.replace('Id', '_id')}`, `${label} es inválido.`);
  }
}

function assertContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new DesignStoreError(403, 'target_outside_store', 'Una imagen objetivo está fuera del almacén visual.');
  }
}

async function writeJsonAtomic(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  await rename(temporaryPath, filePath);
}

function emptyManifest(projectId) {
  return { schemaVersion: 1, projectId, updatedAt: null, targets: [] };
}

function normalizeFrameId(frameId) {
  return !frameId || frameId === 'default' ? 'primary' : frameId;
}
