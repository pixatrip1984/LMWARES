import { execFileSync } from 'node:child_process';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;
const OPERATIONS = new Set(['discover', 'implement']);
const ROOT_KEYS = new Set(['schemaVersion', 'devRoot', 'worktreesRoot', 'projects']);
const PROJECT_KEYS = new Set([
  'enabled',
  'repo',
  'trust',
  'baseRef',
  'expectedRemote',
  'expectedPaths',
  'maxParallel',
  'operations',
  'model',
]);

export class AgentRunnerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AgentRunnerError';
    this.status = status;
    this.code = code;
  }
}

export async function inspectAgentProject({ projectId, scanPath, policyPath }) {
  assertProjectId(projectId);
  const scan = await readRequiredJson(scanPath, 'scan_not_found', 'No existe el escaneo local.');
  const scannedProject = findScannedProject(scan, projectId);
  const base = {
    projectId,
    repo: scannedProject.repo,
    name: scannedProject.name ?? projectId,
    enabled: false,
    reasonCode: null,
    reason: null,
    repoPath: null,
    worktreesRoot: null,
    baseRef: null,
    baseRevision: null,
    maxParallel: 0,
    operations: [],
    model: null,
  };

  const policy = await readOptionalJson(policyPath);
  if (!policy) {
    return blocked(
      base,
      'policy_missing',
      'Falta .lmwares/agent-policy.local.json; ningún agente local está autorizado.',
    );
  }

  const policyProblem = validatePolicyShape(policy);
  if (policyProblem) return blocked(base, 'policy_invalid', policyProblem);

  const entry = policy.projects[projectId];
  if (!entry || entry.enabled !== true) {
    return blocked(base, 'project_not_enabled', 'El proyecto no está habilitado para agentes.');
  }
  if (entry.trust !== 'trusted-local') {
    return blocked(
      base,
      'project_not_trusted',
      'La política debe declarar trust="trusted-local".',
    );
  }

  const paths = await resolveAndVerifyPaths({
    devRoot: policy.devRoot,
    worktreesRoot: policy.worktreesRoot,
    policyRepo: entry.repo,
    scannedRepo: scannedProject.repo,
  });
  if (!paths.ok) return blocked(base, paths.code, paths.reason);

  const git = inspectGit(paths.repoPath, entry.baseRef, entry.expectedRemote);
  if (!git.ok) return blocked(base, git.code, git.reason);

  const missingPath = await firstMissingPath(paths.repoPath, entry.expectedPaths ?? []);
  if (missingPath) {
    return blocked(
      base,
      'project_shape_mismatch',
      `Falta la ruta obligatoria del proyecto: ${missingPath}.`,
    );
  }

  return {
    ...base,
    enabled: true,
    repoPath: paths.repoPath,
    worktreesRoot: paths.worktreesRoot,
    baseRef: entry.baseRef,
    baseRevision: git.baseRevision,
    maxParallel: entry.maxParallel,
    operations: [...entry.operations],
    model: entry.model ?? null,
  };
}

export function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new AgentRunnerError(422, 'invalid_project_id', 'Id de proyecto inválido.');
  }
}

function validatePolicyShape(policy) {
  if (!isPlainObject(policy)) return 'La política debe ser un objeto JSON.';
  const unknownRoot = Object.keys(policy).find((key) => !ROOT_KEYS.has(key));
  if (unknownRoot) return `Campo no permitido en la política: ${unknownRoot}.`;
  if (policy.schemaVersion !== 1) return 'schemaVersion debe ser 1.';
  if (typeof policy.devRoot !== 'string' || !path.isAbsolute(policy.devRoot)) {
    return 'devRoot debe ser una ruta absoluta.';
  }
  if (typeof policy.worktreesRoot !== 'string' || !path.isAbsolute(policy.worktreesRoot)) {
    return 'worktreesRoot debe ser una ruta absoluta.';
  }
  if (!isPlainObject(policy.projects)) return 'projects debe ser un objeto.';

  for (const [projectId, entry] of Object.entries(policy.projects)) {
    if (!PROJECT_ID_PATTERN.test(projectId)) return `Id de proyecto inválido: ${projectId}.`;
    if (!isPlainObject(entry)) return `La política de ${projectId} debe ser un objeto.`;
    const unknown = Object.keys(entry).find((key) => !PROJECT_KEYS.has(key));
    if (unknown) return `Campo no permitido en ${projectId}: ${unknown}.`;
    if (typeof entry.enabled !== 'boolean') return `${projectId}.enabled debe ser boolean.`;
    if (typeof entry.repo !== 'string' || !path.isAbsolute(entry.repo)) {
      return `${projectId}.repo debe ser una ruta absoluta.`;
    }
    if (entry.trust !== 'trusted-local') return `${projectId}.trust debe ser trusted-local.`;
    if (typeof entry.baseRef !== 'string' || !isSafeGitRef(entry.baseRef)) {
      return `${projectId}.baseRef no es una referencia Git segura.`;
    }
    if (typeof entry.expectedRemote !== 'string' || entry.expectedRemote.length > 500) {
      return `${projectId}.expectedRemote es obligatorio.`;
    }
    if (!Array.isArray(entry.expectedPaths) || entry.expectedPaths.length === 0) {
      return `${projectId}.expectedPaths debe contener rutas obligatorias.`;
    }
    if (
      entry.expectedPaths.some(
        (value) => typeof value !== 'string' || !isSafeRelativePath(value),
      )
    ) {
      return `${projectId}.expectedPaths contiene una ruta inválida.`;
    }
    if (!Number.isInteger(entry.maxParallel) || entry.maxParallel < 1 || entry.maxParallel > 8) {
      return `${projectId}.maxParallel debe estar entre 1 y 8.`;
    }
    if (
      !Array.isArray(entry.operations) ||
      entry.operations.length === 0 ||
      new Set(entry.operations).size !== entry.operations.length ||
      entry.operations.some((operation) => !OPERATIONS.has(operation))
    ) {
      return `${projectId}.operations contiene operaciones inválidas.`;
    }
    if (entry.model !== undefined && (typeof entry.model !== 'string' || entry.model.length > 100)) {
      return `${projectId}.model es inválido.`;
    }
  }
  return null;
}

async function resolveAndVerifyPaths({ devRoot, worktreesRoot, policyRepo, scannedRepo }) {
  try {
    const [resolvedRoot, configuredRepo, discoveredRepo] = await Promise.all([
      realpath(devRoot),
      realpath(policyRepo),
      realpath(scannedRepo),
    ]);
    const repoStats = await stat(configuredRepo);
    if (!repoStats.isDirectory()) {
      return { ok: false, code: 'repo_not_directory', reason: 'El repo no es un directorio.' };
    }
    if (!samePath(configuredRepo, discoveredRepo)) {
      return {
        ok: false,
        code: 'repo_mismatch',
        reason: 'La ruta escaneada no coincide con la ruta autorizada.',
      };
    }
    if (!isInside(resolvedRoot, configuredRepo)) {
      return {
        ok: false,
        code: 'repo_outside_root',
        reason: 'El repo autorizado escapa de devRoot.',
      };
    }
    const candidateWorktrees = path.resolve(worktreesRoot);
    if (!isInside(resolvedRoot, candidateWorktrees)) {
      return {
        ok: false,
        code: 'worktrees_outside_root',
        reason: 'worktreesRoot debe permanecer dentro de devRoot.',
      };
    }
    if (isInside(configuredRepo, candidateWorktrees)) {
      return {
        ok: false,
        code: 'worktrees_inside_project',
        reason: 'Los worktrees no pueden vivir dentro del proyecto ejecutado.',
      };
    }
    return { ok: true, repoPath: configuredRepo, worktreesRoot: candidateWorktrees };
  } catch {
    return {
      ok: false,
      code: 'repo_unavailable',
      reason: 'No fue posible resolver la ruta autorizada del proyecto.',
    };
  }
}

function inspectGit(repoPath, baseRef, expectedRemote) {
  try {
    const inside = git(repoPath, ['rev-parse', '--is-inside-work-tree']);
    if (inside !== 'true') {
      return { ok: false, code: 'git_required', reason: 'El proyecto no es un repositorio Git.' };
    }
    const remote = git(repoPath, ['remote', 'get-url', 'origin']);
    if (normalizeRemote(remote) !== normalizeRemote(expectedRemote)) {
      return {
        ok: false,
        code: 'remote_mismatch',
        reason: 'El remote origin no coincide con el repositorio autorizado.',
      };
    }
    const baseRevision = git(repoPath, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
    return { ok: true, baseRevision };
  } catch {
    return {
      ok: false,
      code: 'base_ref_missing',
      reason: `No fue posible resolver la base autorizada ${baseRef}.`,
    };
  }
}

async function firstMissingPath(repoPath, expectedPaths) {
  for (const relativePath of expectedPaths) {
    try {
      await access(path.join(repoPath, relativePath));
    } catch {
      return relativePath;
    }
  }
  return null;
}

function findScannedProject(scan, projectId) {
  if (!isPlainObject(scan) || !Array.isArray(scan.projects)) {
    throw new AgentRunnerError(500, 'scan_invalid', 'El escaneo local no cumple el contrato.');
  }
  const project = scan.projects.find((item) => isPlainObject(item) && item.id === projectId);
  if (!project || typeof project.repo !== 'string') {
    throw new AgentRunnerError(404, 'project_not_scanned', 'El proyecto no existe en el escaneo.');
  }
  return project;
}

function git(repoPath, args) {
  return execFileSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
  }).trim();
}

function normalizeRemote(value) {
  return value.trim().replace(/\\/g, '/').replace(/\.git$/i, '').toLowerCase();
}

function isSafeGitRef(value) {
  return value.length <= 240 && !/[\s~^:?*\[\\]/.test(value) && !value.includes('..');
}

function isSafeRelativePath(value) {
  if (!value || path.isAbsolute(value) || value.includes('\0')) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
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
  if (value === null) throw new AgentRunnerError(503, code, message);
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
