import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { publicValidator, VALIDATOR_CATALOG } from './catalog.mjs';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;
const POLICY_ROOT_KEYS = new Set(['schemaVersion', 'devRoot', 'projects']);
const POLICY_PROJECT_KEYS = new Set(['enabled', 'repo', 'trust', 'validators']);

export class RunnerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'RunnerError';
    this.status = status;
    this.code = code;
  }
}

export async function inspectRunnerProject({
  projectId,
  scanPath,
  policyPath,
  catalog = VALIDATOR_CATALOG,
}) {
  assertProjectId(projectId);
  const scan = await readRequiredJson(scanPath, 'scan_not_found', 'No existe el escaneo local.');
  const scannedProject = findScannedProject(scan, projectId);
  const base = {
    projectId,
    repo: scannedProject.repo,
    enabled: false,
    reasonCode: null,
    reason: null,
    validators: [],
    repoPath: null,
    validatorIds: [],
  };

  const policy = await readOptionalJson(policyPath);
  if (!policy) {
    return blocked(
      base,
      'policy_missing',
      'Falta .lmwares/runner-policy.local.json; ningún repo externo está autorizado.',
    );
  }

  const policyProblem = validatePolicyShape(policy, catalog);
  if (policyProblem) return blocked(base, 'policy_invalid', policyProblem);

  const entry = policy.projects[projectId];
  if (!entry || entry.enabled !== true) {
    return blocked(
      base,
      'project_not_enabled',
      'El proyecto no está habilitado en la política local.',
    );
  }
  if (entry.trust !== 'trusted-local') {
    return blocked(
      base,
      'project_not_trusted',
      'La política debe declarar trust="trusted-local" para ejecutar scripts del repo.',
    );
  }

  const paths = await resolveAndVerifyPaths({
    policyRoot: policy.devRoot,
    policyRepo: entry.repo,
    scannedRepo: scannedProject.repo,
  });
  if (!paths.ok) return blocked(base, paths.code, paths.reason);

  const packageJson = await readOptionalJson(path.join(paths.repoPath, 'package.json'));
  if (!packageJson || !isPlainObject(packageJson.scripts)) {
    return blocked(
      base,
      'package_scripts_missing',
      'El repo no contiene scripts npm verificables.',
    );
  }

  const validators = entry.validators.map((validatorId) => {
    const definition = catalog.get(validatorId);
    const available = typeof packageJson.scripts[definition.script] === 'string';
    return publicValidator(
      definition,
      available,
      available ? null : `Falta el script npm ${definition.script}.`,
    );
  });

  return {
    ...base,
    enabled: validators.some((validator) => validator.available),
    reasonCode: validators.some((validator) => validator.available) ? null : 'no_validator_scripts',
    reason: validators.some((validator) => validator.available)
      ? null
      : 'La política autoriza validadores, pero el repo no declara sus scripts npm.',
    validators,
    repoPath: paths.repoPath,
    validatorIds: entry.validators,
  };
}

export function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new RunnerError(422, 'invalid_project_id', 'Id de proyecto inválido.');
  }
}

function findScannedProject(scan, projectId) {
  if (!isPlainObject(scan) || !Array.isArray(scan.projects)) {
    throw new RunnerError(500, 'scan_invalid', 'El escaneo local no cumple el contrato esperado.');
  }
  const project = scan.projects.find((item) => isPlainObject(item) && item.id === projectId);
  if (!project || typeof project.repo !== 'string') {
    throw new RunnerError(404, 'project_not_scanned', 'El proyecto no existe en el escaneo local.');
  }
  return project;
}

function validatePolicyShape(policy, catalog) {
  if (!isPlainObject(policy)) return 'La política debe ser un objeto JSON.';
  const unknownRoot = Object.keys(policy).find((key) => !POLICY_ROOT_KEYS.has(key));
  if (unknownRoot) return `Campo no permitido en la política: ${unknownRoot}.`;
  if (policy.schemaVersion !== 1) return 'schemaVersion debe ser 1.';
  if (typeof policy.devRoot !== 'string' || !path.isAbsolute(policy.devRoot)) {
    return 'devRoot debe ser una ruta absoluta.';
  }
  if (!isPlainObject(policy.projects)) return 'projects debe ser un objeto.';

  for (const [projectId, entry] of Object.entries(policy.projects)) {
    if (!PROJECT_ID_PATTERN.test(projectId)) return `Id de proyecto inválido: ${projectId}.`;
    if (!isPlainObject(entry)) return `La política de ${projectId} debe ser un objeto.`;
    const unknown = Object.keys(entry).find((key) => !POLICY_PROJECT_KEYS.has(key));
    if (unknown) return `Campo no permitido en ${projectId}: ${unknown}.`;
    if (typeof entry.enabled !== 'boolean') return `${projectId}.enabled debe ser boolean.`;
    if (typeof entry.repo !== 'string' || !path.isAbsolute(entry.repo)) {
      return `${projectId}.repo debe ser una ruta absoluta.`;
    }
    if (entry.trust !== 'trusted-local') return `${projectId}.trust debe ser trusted-local.`;
    if (!Array.isArray(entry.validators) || entry.validators.length === 0) {
      return `${projectId}.validators debe contener al menos un validador.`;
    }
    if (entry.validators.length > catalog.size)
      return `${projectId}.validators excede el catálogo.`;
    if (new Set(entry.validators).size !== entry.validators.length) {
      return `${projectId}.validators contiene duplicados.`;
    }
    const invalidValidator = entry.validators.find(
      (validatorId) => typeof validatorId !== 'string' || !catalog.has(validatorId),
    );
    if (invalidValidator) return `Validador no permitido en ${projectId}: ${invalidValidator}.`;
  }
  return null;
}

async function resolveAndVerifyPaths({ policyRoot, policyRepo, scannedRepo }) {
  try {
    const [rootPath, configuredRepo, discoveredRepo] = await Promise.all([
      realpath(policyRoot),
      realpath(policyRepo),
      realpath(scannedRepo),
    ]);
    const repoStats = await stat(configuredRepo);
    if (!repoStats.isDirectory()) {
      return {
        ok: false,
        code: 'repo_not_directory',
        reason: 'El repo autorizado no es un directorio.',
      };
    }
    if (!samePath(configuredRepo, discoveredRepo)) {
      return {
        ok: false,
        code: 'repo_mismatch',
        reason: 'La ruta del escaneo no coincide con la ruta autorizada por la política.',
      };
    }
    if (!isInside(rootPath, configuredRepo)) {
      return {
        ok: false,
        code: 'repo_outside_root',
        reason: 'La ruta autorizada escapa de devRoot.',
      };
    }
    return { ok: true, repoPath: configuredRepo };
  } catch {
    return {
      ok: false,
      code: 'repo_unavailable',
      reason: 'No fue posible resolver la ruta autorizada del proyecto.',
    };
  }
}

function isInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function samePath(left, right) {
  const normalize = (value) =>
    process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  return normalize(left) === normalize(right);
}

function blocked(base, reasonCode, reason) {
  return { ...base, reasonCode, reason };
}

async function readRequiredJson(filePath, code, message) {
  const value = await readOptionalJson(filePath);
  if (value === null) throw new RunnerError(503, code, message);
  return value;
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return { __invalidJson: true };
    throw error;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
