import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type {
  LmwaresProject,
  LmwaresProjectHealth,
  LmwaresProjectPhase,
  LmwaresProjectPreview,
  LmwaresProjectPriority,
  LmwaresProjectSnapshot,
  LmwaresSnapshotKind,
  Metadata,
} from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';
import { mapLmwaresProject, mapLmwaresProjectSnapshot } from '../mappers';
import type { LmwaresProjectRow, LmwaresProjectSnapshotRow } from '../rows';

export interface UpsertLmwaresProjectData {
  id: string;
  name: string;
  business: string;
  category: string;
  statusLabel: string;
  phase: string;
  progress: number;
  priority: LmwaresProjectPriority;
  health: LmwaresProjectHealth;
  repo: string;
  branch: string;
  previewUrl: string;
  lastRefresh: string;
  developer: string;
  due: string;
  day: number;
  daysLeft: number;
  nextAction: string;
  seedPrompt: string;
  tags: string[];
  preview: LmwaresProjectPreview;
  phases: LmwaresProjectPhase[];
  registrySource: string;
  manifestPath: string | null;
  scanMetadata: Metadata;
}

export interface CreateLmwaresSnapshotData {
  projectId: string;
  kind: LmwaresSnapshotKind;
  label: string;
  summary?: string | null;
  sourceRevision?: string | null;
  previewUrl?: string | null;
  artifactPath?: string | null;
  metadata?: Metadata;
  createdBy: string;
}

export class LmwaresProjectsRepository {
  constructor(private readonly db: D1Database) {}

  async listAll(): Promise<LmwaresProject[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM lmwares_projects
         ORDER BY
           CASE priority WHEN 'Alta' THEN 0 WHEN 'Media' THEN 1 ELSE 2 END,
           days_left ASC,
           progress DESC,
           name ASC`,
      )
      .all<LmwaresProjectRow>();
    return results.map(mapLmwaresProject);
  }

  async getById(id: string): Promise<LmwaresProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmwares_projects WHERE id = ?`)
      .bind(id)
      .first<LmwaresProjectRow>();
    return row ? mapLmwaresProject(row) : null;
  }

  async sync(projects: UpsertLmwaresProjectData[], scannedAt: string): Promise<LmwaresProject[]> {
    const now = nowIso();
    const statements: D1PreparedStatement[] = projects.map((project) =>
      this.db
        .prepare(
          `INSERT INTO lmwares_projects (
            id, name, business, category, status_label, phase, progress, priority, health,
            repo_path, branch, preview_url, last_refresh, developer, due, day, days_left,
            next_action, seed_prompt, tags, preview, phases, registry_source, manifest_path,
            scan_metadata, first_seen_at, last_scanned_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            business = excluded.business,
            category = excluded.category,
            status_label = excluded.status_label,
            phase = excluded.phase,
            progress = excluded.progress,
            priority = excluded.priority,
            health = excluded.health,
            repo_path = excluded.repo_path,
            branch = excluded.branch,
            preview_url = excluded.preview_url,
            last_refresh = excluded.last_refresh,
            developer = excluded.developer,
            due = excluded.due,
            day = excluded.day,
            days_left = excluded.days_left,
            next_action = excluded.next_action,
            seed_prompt = excluded.seed_prompt,
            tags = excluded.tags,
            preview = excluded.preview,
            phases = excluded.phases,
            registry_source = excluded.registry_source,
            manifest_path = excluded.manifest_path,
            scan_metadata = excluded.scan_metadata,
            last_scanned_at = excluded.last_scanned_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          project.id,
          project.name,
          project.business,
          project.category,
          project.statusLabel,
          project.phase,
          project.progress,
          project.priority,
          project.health,
          project.repo,
          project.branch,
          project.previewUrl,
          project.lastRefresh,
          project.developer,
          project.due,
          project.day,
          project.daysLeft,
          project.nextAction,
          project.seedPrompt,
          JSON.stringify(project.tags),
          JSON.stringify(project.preview),
          JSON.stringify(project.phases),
          project.registrySource,
          nullable(project.manifestPath),
          JSON.stringify(project.scanMetadata),
          now,
          scannedAt,
          now,
          now,
        ),
    );

    if (statements.length > 0) {
      await this.db.batch(statements);
    }
    return this.listAll();
  }
}

export class LmwaresProjectSnapshotsRepository {
  constructor(private readonly db: D1Database) {}

  async getById(id: string): Promise<LmwaresProjectSnapshot | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmwares_project_snapshots WHERE id = ?`)
      .bind(id)
      .first<LmwaresProjectSnapshotRow>();
    return row ? mapLmwaresProjectSnapshot(row) : null;
  }

  async listForProject(projectId: string, limit = 50): Promise<LmwaresProjectSnapshot[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM lmwares_project_snapshots
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(projectId, limit)
      .all<LmwaresProjectSnapshotRow>();
    return results.map(mapLmwaresProjectSnapshot);
  }

  async create(data: CreateLmwaresSnapshotData): Promise<LmwaresProjectSnapshot> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmwares_project_snapshots (
          id, project_id, kind, label, summary, source_revision, preview_url,
          artifact_path, metadata, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.projectId,
        data.kind,
        data.label,
        nullable(data.summary),
        nullable(data.sourceRevision),
        nullable(data.previewUrl),
        nullable(data.artifactPath),
        JSON.stringify(data.metadata ?? {}),
        data.createdBy,
        now,
      )
      .run();

    const row = await this.db
      .prepare(`SELECT * FROM lmwares_project_snapshots WHERE id = ?`)
      .bind(id)
      .first<LmwaresProjectSnapshotRow>();
    if (!row) throw new Error('No se pudo leer el snapshot recién creado.');
    return mapLmwaresProjectSnapshot(row);
  }
}
