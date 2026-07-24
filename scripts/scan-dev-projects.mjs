import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devRoot = process.env.LMWARES_DEV_ROOT || 'C:\\dev';
const outputPath =
  process.env.LMWARES_PROJECTS_OUTPUT ||
  path.join(repoRoot, '.lmwares', 'cache', 'dev-projects.json');
const ignoredNames = new Set([
  '_npm_workspace_probe',
  'cloudflare-starter',
  'oracle',
  'node_modules',
]);

const basePhaseTemplates = [
  {
    id: 'visual',
    label: '01 Entregable visual',
    evidence: 'Public app navegable, primer valor visible, CTA y preview privado.',
    owner: 'Sistema',
  },
  {
    id: 'admin',
    label: '02 Portal admin operativo',
    evidence: 'Portal privado util, datos locales, estados, notas y trazabilidad.',
    owner: 'Desarrollador',
  },
  {
    id: 'final',
    label: '03 Diseno final de portales',
    evidence: 'Iteraciones del sitio publico y portal admin listas para revision privada.',
    owner: 'Desarrollador',
  },
  {
    id: 'staging',
    label: '04 Staging subdominio LMwares',
    evidence: 'Subdominio LMwares, pruebas remotas y datos de prueba sin dominio final.',
    owner: 'Operador LMWARES',
  },
];

function main() {
  if (!existsSync(devRoot)) {
    throw new Error(`No existe LMWARES_DEV_ROOT: ${devRoot}`);
  }

  const projects = readdirSync(devRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !ignoredNames.has(entry.name))
    .map((entry) => scanProject(path.join(devRoot, entry.name), entry.name))
    .filter(Boolean)
    .sort(
      (left, right) =>
        priorityRank(left.priority) - priorityRank(right.priority) ||
        left.daysLeft - right.daysLeft,
    );

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: devRoot,
    ignored: Array.from(ignoredNames),
    source: 'local-scan',
    projects,
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Scanned ${projects.length} projects -> ${outputPath}`);
}

function scanProject(projectPath, slug) {
  const manifest = readJson(path.join(projectPath, '.lmwares', 'project.json'));
  const packageJson = readJson(path.join(projectPath, 'package.json'));
  const stats = statSync(projectPath);
  const git = readGit(projectPath);
  const signals = readSignals(projectPath, packageJson);
  const inferredStatuses = inferStatuses(signals);
  const manifestPhases = Array.isArray(manifest?.phases) ? manifest.phases : null;
  const phases = manifestPhases
    ? normalizeManifestPhases(manifestPhases, inferredStatuses)
    : buildPhases(inferredStatuses);
  const currentPhase = getCurrentPhase(phases);
  const timing = readTiming(manifest, git, stats);
  const progress = calculateProgress(phases);
  const name = manifest?.name || titleFromSlug(slug);
  const health = inferHealth(phases, timing.daysLeft, signals);
  const priority = manifest?.priority || inferPriority(health, phases, timing.daysLeft);
  const tags = unique([
    ...normalizeStringArray(manifest?.tags),
    ...(signals.isCloudflareStarterLike ? ['cloudflare-starter'] : []),
    ...(signals.hasPackage ? ['package'] : []),
    ...(signals.hasGit ? ['git'] : []),
  ]).slice(0, 4);

  return {
    id: manifest?.id || slug,
    name,
    business: manifest?.business || inferBusiness(packageJson, slug),
    category: manifest?.category || inferCategory(signals),
    statusLabel: statusLabel(currentPhase, manifestPhases ? 'manifest' : 'inferred'),
    phase: currentPhase.label.replace(/^\d+\s*/, ''),
    progress,
    priority,
    health,
    repo: projectPath,
    branch: git.branch || 'sin git',
    previewUrl: manifest?.previewUrl || '',
    lastRefresh: git.lastCommitRelative || relativeTime(stats.mtime),
    developer: manifest?.developer || 'Codex local',
    due: `Dia ${timing.day}/7 - vence ${formatShortDate(timing.dueAt)}`,
    day: timing.day,
    daysLeft: timing.daysLeft,
    nextAction:
      manifest?.nextAction || nextAction(currentPhase, manifestPhases ? 'manifest' : 'inferred'),
    seedPrompt:
      manifest?.seedPrompt ||
      `Continuar ${name} con la skill desarrollador-relampago, usando fases base y evidencia por fase.`,
    tags,
    preview: {
      title: manifest?.preview?.title || name,
      subtitle: manifest?.preview?.subtitle || currentPhase.evidence,
      layout: manifest?.preview?.layout || inferLayout(signals),
      palette: manifest?.preview?.palette || paletteFor(slug),
    },
    phases,
    lmwares: {
      source: manifestPhases ? 'manifest' : 'inferred',
      manifestPath: existsSync(path.join(projectPath, '.lmwares', 'project.json'))
        ? path.join(projectPath, '.lmwares', 'project.json')
        : null,
      signals,
      git,
    },
  };
}

function readSignals(projectPath, packageJson) {
  const hasPackage = Boolean(packageJson);
  const hasGit = existsSync(path.join(projectPath, '.git'));
  const hasApps = existsSync(path.join(projectPath, 'apps'));
  const hasWorkers = existsSync(path.join(projectPath, 'workers'));
  const hasPackages = existsSync(path.join(projectPath, 'packages'));
  const hasPublicWeb = existsSync(path.join(projectPath, 'apps', 'public-web'));
  const hasAdminWeb = existsSync(path.join(projectPath, 'apps', 'admin-web'));
  const hasPublicApi = existsSync(path.join(projectPath, 'workers', 'public-api'));
  const hasAdminApi = existsSync(path.join(projectPath, 'workers', 'admin-api'));
  const hasDeploy = existsSync(path.join(projectPath, 'deploy'));
  const hasManagedProfiles = existsSync(path.join(projectPath, 'deploy', 'profiles'));
  const hasDeployArtifacts = existsSync(path.join(projectPath, '.deploy'));
  const scripts = packageJson?.scripts ? Object.keys(packageJson.scripts) : [];
  const isCloudflareStarterLike =
    hasPackage && hasApps && hasWorkers && hasPackages && scripts.includes('validate:local');

  return {
    hasGit,
    hasPackage,
    hasApps,
    hasWorkers,
    hasPackages,
    hasPublicWeb,
    hasAdminWeb,
    hasPublicApi,
    hasAdminApi,
    hasDeploy,
    hasManagedProfiles,
    hasDeployArtifacts,
    isCloudflareStarterLike,
    scripts,
  };
}

function inferStatuses(signals) {
  if (signals.hasManagedProfiles || signals.hasDeployArtifacts) {
    return { visual: 'review', admin: 'review', final: 'review', staging: 'active' };
  }
  if (signals.isCloudflareStarterLike) {
    return { visual: 'review', admin: 'active', final: 'locked', staging: 'locked' };
  }
  if (signals.hasPackage || signals.hasGit) {
    return { visual: 'active', admin: 'locked', final: 'locked', staging: 'locked' };
  }
  return { visual: 'blocked', admin: 'locked', final: 'locked', staging: 'locked' };
}

function buildPhases(statuses) {
  return basePhaseTemplates.map((phase) => {
    const status = normalizeStatus(statuses[phase.id] || 'locked');
    return { ...phase, status };
  });
}

function normalizeManifestPhases(manifestPhases, inferredStatuses) {
  const byId = new Map(manifestPhases.map((phase) => [phase.id, phase]));

  return basePhaseTemplates.map((template) => {
    const phase = byId.get(template.id) || {};
    return {
      id: template.id,
      label: typeof phase.label === 'string' ? phase.label : template.label,
      evidence: typeof phase.evidence === 'string' ? phase.evidence : template.evidence,
      owner: typeof phase.owner === 'string' ? phase.owner : template.owner,
      status: normalizeStatus(phase.status || inferredStatuses[template.id] || 'locked'),
    };
  });
}

function normalizeStatus(status) {
  if (status === 'done') return 'completed';
  if (['completed', 'active', 'review', 'locked', 'blocked'].includes(status)) return status;
  return 'locked';
}

function getCurrentPhase(phases) {
  return (
    phases.find((phase) => phase.status === 'active') ||
    phases.find((phase) => phase.status === 'review') ||
    phases.find((phase) => phase.status === 'blocked') ||
    phases.find((phase) => phase.status === 'locked') ||
    phases.at(-1) ||
    phases[0]
  );
}

function calculateProgress(phases) {
  const score = phases.slice(0, 4).reduce((total, phase) => {
    if (phase.status === 'completed') return total + 25;
    if (phase.status === 'review') return total + 18;
    if (phase.status === 'active') return total + 10;
    return total;
  }, 0);

  return Math.min(100, Math.max(0, Math.round(score)));
}

function readTiming(manifest, git, stats) {
  const startedAt = manifest?.startedAt
    ? new Date(manifest.startedAt)
    : git.firstCommitAt || stats.birthtime;
  const dayMs = 24 * 60 * 60 * 1000;
  const elapsed = Math.max(0, Date.now() - startedAt.getTime());
  const day = Math.min(7, Math.max(1, Math.floor(elapsed / dayMs) + 1));
  const daysLeft = Math.max(0, 7 - day);
  const dueAt = manifest?.dueAt
    ? new Date(manifest.dueAt)
    : new Date(startedAt.getTime() + 7 * dayMs);

  return { startedAt, day, daysLeft, dueAt };
}

function readGit(projectPath) {
  if (!existsSync(path.join(projectPath, '.git'))) {
    return {
      branch: null,
      dirty: false,
      firstCommitAt: null,
      lastCommitAt: null,
      lastCommitRelative: null,
    };
  }

  const branch = git(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'git';
  const commitSha = git(projectPath, ['rev-parse', 'HEAD']);
  const status = git(projectPath, ['status', '--porcelain']) || '';
  const firstCommitIso = git(projectPath, ['log', '--reverse', '--format=%cI', '--max-count=1']);
  const lastCommitIso = git(projectPath, ['log', '-1', '--format=%cI']);
  const lastCommitAt = lastCommitIso ? new Date(lastCommitIso) : null;

  return {
    branch,
    commitSha,
    dirty: status.trim().length > 0,
    firstCommitAt: firstCommitIso ? new Date(firstCommitIso) : null,
    lastCommitAt,
    lastCommitRelative: lastCommitAt ? relativeTime(lastCommitAt) : null,
  };
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function statusLabel(phase, source) {
  const prefix = source === 'manifest' ? 'Confirmado' : 'Inferido';
  if (phase.status === 'review') return `${prefix}: en revision`;
  if (phase.status === 'active') return `${prefix}: en desarrollo`;
  if (phase.status === 'completed') return `${prefix}: completado`;
  if (phase.status === 'blocked') return `${prefix}: bloqueado`;
  return `${prefix}: pendiente`;
}

function nextAction(phase, source) {
  if (phase.status === 'review') {
    return source === 'manifest'
      ? 'Revisar evidencia del agente y aceptar la fase o pedir correcciones.'
      : 'Confirmar si la evidencia inferida corresponde a una entrega real del agente.';
  }
  if (phase.status === 'active') return `Continuar ${phase.label}: ${phase.evidence}`;
  if (phase.status === 'completed')
    return 'Proyecto completado: mantener evidencia y abrir nueva tanda solo si hay ajustes.';
  if (phase.status === 'blocked')
    return 'Clasificar el proyecto y completar datos minimos antes de avanzar.';
  return `Preparar ${phase.label} cuando se cierre la fase anterior.`;
}

function inferHealth(phases, daysLeft, signals) {
  if (phases.every((phase) => phase.status === 'completed')) return 'on-track';
  if (!signals.hasPackage && !signals.hasGit) return 'at-risk';
  if (daysLeft <= 1) return 'at-risk';
  if (phases.some((phase) => phase.status === 'review' || phase.status === 'blocked'))
    return 'needs-action';
  return 'on-track';
}

function inferPriority(health, phases, daysLeft) {
  if (health === 'at-risk' || phases.some((phase) => phase.status === 'review')) return 'Alta';
  if (daysLeft <= 3) return 'Media';
  return 'Normal';
}

function inferBusiness(packageJson, slug) {
  if (packageJson?.description) return packageJson.description;
  return titleFromSlug(slug);
}

function inferCategory(signals) {
  if (signals.isCloudflareStarterLike) return 'Cliente LMwares';
  return 'Sin clasificar';
}

function inferLayout(signals) {
  return signals.isCloudflareStarterLike ? 'service' : 'service';
}

function titleFromSlug(slug) {
  return slug
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function paletteFor(slug) {
  const colors = ['#224f8e', '#9b3f67', '#0f7c55', '#6f573a', '#365d8d', '#7d6b45'];
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

function relativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 2) return 'hace 1 min';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function priorityRank(priority) {
  if (priority === 'Alta') return 0;
  if (priority === 'Media') return 1;
  return 2;
}

main();
