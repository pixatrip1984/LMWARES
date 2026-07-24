import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const SCREEN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const MAX_SCREENS = 200;

export class VisualMapStoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'VisualMapStoreError';
    this.status = status;
    this.code = code;
  }
}

export async function readVisualMap({ designsRoot, projectId }) {
  assertStore(designsRoot);
  assertId(projectId, 'projectId');
  const filePath = visualMapPath(designsRoot, projectId);
  try {
    const payload = JSON.parse(await readFile(filePath, 'utf8'));
    validateStoredMap(payload, projectId);
    return payload;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new VisualMapStoreError(500, 'invalid_visual_map', 'El mapa visual guardado es inválido.');
    }
    throw error;
  }
}

export async function saveVisualMap({ designsRoot, projectId, selectedScreenId, screens, updatedAt = new Date().toISOString() }) {
  assertStore(designsRoot);
  assertId(projectId, 'projectId');
  validateDraft({ selectedScreenId, screens });
  const payload = {
    schemaVersion: 1,
    projectId,
    updatedAt,
    selectedScreenId,
    screens,
  };
  const filePath = visualMapPath(designsRoot, projectId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  await rename(temporaryPath, filePath);
  return payload;
}

function validateStoredMap(payload, projectId) {
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    payload.projectId !== projectId ||
    typeof payload.updatedAt !== 'string'
  ) {
    throw new VisualMapStoreError(500, 'invalid_visual_map', 'El mapa visual no coincide con el proyecto.');
  }
  validateDraft(payload);
}

function validateDraft({ selectedScreenId, screens }) {
  if (!Array.isArray(screens) || screens.length < 1 || screens.length > MAX_SCREENS) {
    throw new VisualMapStoreError(422, 'invalid_visual_map', 'El mapa debe contener entre 1 y 200 tareas visuales.');
  }
  if (typeof selectedScreenId !== 'string' || !SCREEN_ID_PATTERN.test(selectedScreenId)) {
    throw new VisualMapStoreError(422, 'invalid_visual_map', 'La tarea seleccionada es inválida.');
  }
  const ids = new Set();
  for (const screen of screens) {
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) {
      throw new VisualMapStoreError(422, 'invalid_visual_map', 'Una tarea visual es inválida.');
    }
    if (typeof screen.id !== 'string' || !SCREEN_ID_PATTERN.test(screen.id) || ids.has(screen.id)) {
      throw new VisualMapStoreError(422, 'invalid_visual_map', 'Los ids de las tareas visuales son inválidos o están repetidos.');
    }
    ids.add(screen.id);
    if (containsTransientImageData(screen)) {
      throw new VisualMapStoreError(422, 'invalid_visual_map', 'El mapa no debe persistir rutas ni URLs de imágenes.');
    }
  }
  if (!ids.has(selectedScreenId)) {
    throw new VisualMapStoreError(422, 'invalid_visual_map', 'La tarea seleccionada no pertenece al mapa.');
  }
}

function containsTransientImageData(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    if (/Image(?:Url|Path)$/i.test(key)) return true;
    if (containsTransientImageData(nested)) return true;
  }
  return false;
}

function visualMapPath(designsRoot, projectId) {
  return path.join(designsRoot, projectId, 'visual-map.json');
}

function assertStore(designsRoot) {
  if (!designsRoot || !path.isAbsolute(designsRoot)) {
    throw new VisualMapStoreError(503, 'visual_map_store_unavailable', 'El almacén del mapa visual no está configurado.');
  }
}

function assertId(value, label) {
  if (typeof value !== 'string' || !PROJECT_ID_PATTERN.test(value)) {
    throw new VisualMapStoreError(422, `invalid_${label}`, `${label} es inválido.`);
  }
}
