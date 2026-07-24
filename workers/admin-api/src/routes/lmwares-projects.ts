import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  createLmwaresApprovalSchema,
  createLmwaresSnapshotSchema,
  createLmwaresValidationSchema,
  parseInput,
  syncLmwaresProjectsSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireApproval, requireWrite } from '../middleware/auth';

export const lmwaresProjects = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

/** GET /admin/projects — registro privado canónico. */
lmwaresProjects.get('/', async (c) => {
  const repos = createRepositories(c.env.DB);
  const projects = await repos.lmwaresProjects.listAll();
  return c.json({
    projects,
    source: 'd1-registry' as const,
    syncedAt: latestSync(projects),
  });
});

/** POST /admin/projects/sync — importa un descubrimiento local validado. */
lmwaresProjects.post('/sync', requireWrite, async (c) => {
  const input = parseInput(syncLmwaresProjectsSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const projects = await repos.lmwaresProjects.sync(
    input.projects.map((project) => ({
      id: project.id,
      name: project.name,
      business: project.business,
      category: project.category,
      statusLabel: project.statusLabel,
      phase: project.phase,
      progress: project.progress,
      priority: project.priority,
      health: project.health,
      repo: project.repo,
      branch: project.branch,
      previewUrl: project.previewUrl,
      lastRefresh: project.lastRefresh,
      developer: project.developer,
      due: project.due,
      day: project.day,
      daysLeft: project.daysLeft,
      nextAction: project.nextAction,
      seedPrompt: project.seedPrompt,
      tags: project.tags,
      preview: project.preview,
      phases: project.phases,
      registrySource: `${input.source}:${project.lmwares.source}`,
      manifestPath: project.lmwares.manifestPath,
      scanMetadata: {
        root: input.root,
        signals: project.lmwares.signals,
        git: project.lmwares.git,
      },
    })),
    input.generatedAt,
  );

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.projects.sync',
    entityType: 'lmwares_project',
    metadata: {
      count: input.projects.length,
      root: input.root,
      generatedAt: input.generatedAt,
    },
  });

  return c.json({
    projects,
    source: 'd1-registry' as const,
    syncedAt: input.generatedAt,
    upserted: input.projects.length,
  });
});

/** GET /admin/projects/:id — proyecto registrado. */
lmwaresProjects.get('/:id', async (c) => {
  const repos = createRepositories(c.env.DB);
  const project = await repos.lmwaresProjects.getById(c.req.param('id'));
  if (!project) throw AppError.notFound('Proyecto');
  return c.json(project);
});

/** GET /admin/projects/:id/snapshots — evidencia inmutable del proyecto. */
lmwaresProjects.get('/:id/snapshots', async (c) => {
  const projectId = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);
  if (!(await repos.lmwaresProjects.getById(projectId))) {
    throw AppError.notFound('Proyecto');
  }
  return c.json(await repos.lmwaresProjectSnapshots.listForProject(projectId));
});

/** POST /admin/projects/:id/snapshots — deja evidencia sin ejecutar ni desplegar. */
lmwaresProjects.post('/:id/snapshots', requireWrite, async (c) => {
  const projectId = c.req.param('id')!;
  const input = parseInput(createLmwaresSnapshotSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  if (!(await repos.lmwaresProjects.getById(projectId))) {
    throw AppError.notFound('Proyecto');
  }

  const snapshot = await repos.lmwaresProjectSnapshots.create({
    projectId,
    kind: input.kind,
    label: input.label,
    summary: input.summary ?? null,
    sourceRevision: input.sourceRevision ?? null,
    previewUrl: input.previewUrl || null,
    artifactPath: input.artifactPath ?? null,
    metadata: input.metadata,
    createdBy: c.get('admin').email,
  });

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.snapshot.create',
    entityType: 'lmwares_snapshot',
    entityId: snapshot.id,
    metadata: { projectId, kind: snapshot.kind },
  });
  return c.json(snapshot, 201);
});

/** GET /admin/projects/:id/validations — resultados técnicos append-only. */
lmwaresProjects.get('/:id/validations', async (c) => {
  const projectId = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);
  if (!(await repos.lmwaresProjects.getById(projectId))) {
    throw AppError.notFound('Proyecto');
  }
  return c.json(await repos.lmwaresValidationResults.listForProject(projectId));
});

/** POST /admin/projects/:id/validations — registra evidencia; nunca ejecuta el validador. */
lmwaresProjects.post('/:id/validations', requireWrite, async (c) => {
  const projectId = c.req.param('id')!;
  const input = parseInput(createLmwaresValidationSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  if (!(await repos.lmwaresProjects.getById(projectId))) {
    throw AppError.notFound('Proyecto');
  }
  await assertSnapshotBelongsToProject(repos, input.snapshotId ?? null, projectId);

  const validation = await repos.lmwaresValidationResults.create({
    projectId,
    snapshotId: input.snapshotId ?? null,
    kind: input.kind,
    status: input.status,
    label: input.label,
    summary: input.summary ?? null,
    sourceRevision: input.sourceRevision ?? null,
    artifactPath: input.artifactPath ?? null,
    metadata: input.metadata,
    createdBy: c.get('admin').email,
  });

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.validation.create',
    entityType: 'lmwares_validation',
    entityId: validation.id,
    metadata: {
      projectId,
      snapshotId: validation.snapshotId,
      kind: validation.kind,
      status: validation.status,
    },
  });
  return c.json(validation, 201);
});

/** GET /admin/projects/:id/approvals — historial de decisiones de gates. */
lmwaresProjects.get('/:id/approvals', async (c) => {
  const projectId = c.req.param('id')!;
  const repos = createRepositories(c.env.DB);
  if (!(await repos.lmwaresProjects.getById(projectId))) {
    throw AppError.notFound('Proyecto');
  }
  return c.json(await repos.lmwaresApprovals.listForProject(projectId));
});

/** POST /admin/projects/:id/approvals — decisión humana; no dispara acciones externas. */
lmwaresProjects.post('/:id/approvals', requireApproval, async (c) => {
  const projectId = c.req.param('id')!;
  const input = parseInput(createLmwaresApprovalSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  if (!(await repos.lmwaresProjects.getById(projectId))) {
    throw AppError.notFound('Proyecto');
  }
  await assertSnapshotBelongsToProject(repos, input.snapshotId ?? null, projectId);

  const approval = await repos.lmwaresApprovals.create({
    projectId,
    snapshotId: input.snapshotId ?? null,
    gate: input.gate,
    decision: input.decision,
    comment: input.comment ?? null,
    metadata: input.metadata,
    decidedBy: c.get('admin').email,
  });

  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.approval.create',
    entityType: 'lmwares_approval',
    entityId: approval.id,
    metadata: {
      projectId,
      snapshotId: approval.snapshotId,
      gate: approval.gate,
      decision: approval.decision,
    },
  });
  return c.json(approval, 201);
});

async function assertSnapshotBelongsToProject(
  repos: ReturnType<typeof createRepositories>,
  snapshotId: string | null,
  projectId: string,
): Promise<void> {
  if (!snapshotId) return;
  const snapshot = await repos.lmwaresProjectSnapshots.getById(snapshotId);
  if (!snapshot || snapshot.projectId !== projectId) {
    throw new AppError(
      'validation_error',
      'El snapshot indicado no pertenece al proyecto seleccionado.',
    );
  }
}

function latestSync(projects: Array<{ lastScannedAt: string }>): string | null {
  return projects.reduce<string | null>(
    (latest, project) =>
      latest === null || project.lastScannedAt > latest ? project.lastScannedAt : latest,
    null,
  );
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}
