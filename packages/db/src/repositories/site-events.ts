import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type {
  SiteEvent,
  SiteEventRegistration,
  SiteEventRegistrationStatus,
  SiteEventStatus,
  SiteEventWithAvailability,
} from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';

interface SiteEventRow {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  timezone: string;
  starts_at_utc: string;
  ends_at_utc: string;
  registration_closes_at_utc: string | null;
  capacity: number | null;
  status: string;
  cover_asset_id: string | null;
  published_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  cover_asset_key: string | null;
  cover_asset_content_type: string | null;
  registration_count: number;
  published_revision_at: string | null;
  has_unpublished_changes: number;
}

interface SiteEventRegistrationRow {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  email_normalized: string;
  phone: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface RegistrationDiagnosticRow {
  status: string;
  starts_at_utc: string;
  registration_closes_at_utc: string | null;
  capacity: number | null;
  registration_count: number;
  duplicate_exists: number;
}

export interface SiteEventWriteData {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  timezone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationClosesAtUtc: string | null;
  capacity: number | null;
  coverAssetId: string | null;
}

export interface CreateSiteEventData extends SiteEventWriteData {
  projectId: string;
  actorEmail: string;
}

export interface RegisterForSiteEventData {
  projectId: string;
  eventId: string;
  fullName: string;
  email: string;
  phone: string | null;
  notes: string | null;
}

export type UpdateSiteEventResult =
  | { kind: 'updated'; event: SiteEventWithAvailability }
  | { kind: 'not_found' }
  | { kind: 'slug_conflict' }
  | { kind: 'capacity_below_confirmed'; confirmed: number };

export type RegisterForSiteEventResult =
  | {
      kind: 'created';
      registration: SiteEventRegistration;
      event: SiteEventWithAvailability;
    }
  | { kind: 'not_found' }
  | { kind: 'already_registered' }
  | { kind: 'full' }
  | { kind: 'unavailable'; status: SiteEventStatus };

export type UpdateRegistrationResult =
  | { kind: 'updated'; registration: SiteEventRegistration }
  | { kind: 'not_found' }
  | { kind: 'full' };

const EVENT_SELECT = `
  SELECT
    e.*,
    fa.key AS cover_asset_key,
    fa.content_type AS cover_asset_content_type,
    COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN 1 ELSE 0 END), 0)
      AS registration_count,
    publication.published_at AS published_revision_at,
    CASE
      WHEN publication.event_id IS NULL THEN 0
      WHEN publication.slug <> e.slug
        OR publication.title <> e.title
        OR COALESCE(publication.summary, '') <> COALESCE(e.summary, '')
        OR COALESCE(publication.description, '') <> COALESCE(e.description, '')
        OR COALESCE(publication.venue_name, '') <> COALESCE(e.venue_name, '')
        OR COALESCE(publication.venue_address, '') <> COALESCE(e.venue_address, '')
        OR publication.timezone <> e.timezone
        OR publication.starts_at_utc <> e.starts_at_utc
        OR publication.ends_at_utc <> e.ends_at_utc
        OR COALESCE(publication.registration_closes_at_utc, '') <>
           COALESCE(e.registration_closes_at_utc, '')
        OR COALESCE(publication.capacity, -1) <> COALESCE(e.capacity, -1)
        OR COALESCE(publication.cover_asset_id, '') <> COALESCE(e.cover_asset_id, '')
      THEN 1 ELSE 0
    END AS has_unpublished_changes
  FROM lmwares_events e
  LEFT JOIN file_assets fa ON fa.id = e.cover_asset_id
  LEFT JOIN lmwares_event_registrations r ON r.event_id = e.id
  LEFT JOIN lmwares_event_publications publication ON publication.event_id = e.id
`;

const PUBLIC_EVENT_SELECT = `
  SELECT
    publication.event_id AS id,
    publication.project_id,
    publication.slug,
    publication.title,
    publication.summary,
    publication.description,
    publication.venue_name,
    publication.venue_address,
    publication.timezone,
    publication.starts_at_utc,
    publication.ends_at_utc,
    publication.registration_closes_at_utc,
    publication.capacity,
    publication.status,
    publication.cover_asset_id,
    publication.published_at,
    e.created_by,
    e.updated_by,
    publication.event_created_at AS created_at,
    publication.published_at AS updated_at,
    fa.key AS cover_asset_key,
    fa.content_type AS cover_asset_content_type,
    COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN 1 ELSE 0 END), 0)
      AS registration_count,
    publication.published_at AS published_revision_at,
    0 AS has_unpublished_changes
  FROM lmwares_event_publications publication
  INNER JOIN lmwares_events e ON e.id = publication.event_id
  LEFT JOIN file_assets fa ON fa.id = publication.cover_asset_id
  LEFT JOIN lmwares_event_registrations r ON r.event_id = publication.event_id
`;

export class SiteEventsRepository {
  constructor(private readonly db: D1Database) {}

  async projectExists(projectId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM lmwares_projects WHERE id = ? LIMIT 1`)
      .bind(projectId)
      .first<{ id: string }>();
    return Boolean(row);
  }

  async coverAssetExists(assetId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM file_assets WHERE id = ? LIMIT 1`)
      .bind(assetId)
      .first<{ id: string }>();
    return Boolean(row);
  }

  async listAdmin(projectId: string): Promise<SiteEventWithAvailability[]> {
    const { results } = await this.db
      .prepare(
        `${EVENT_SELECT}
         WHERE e.project_id = ?
         GROUP BY e.id
         ORDER BY e.starts_at_utc ASC, e.created_at ASC`,
      )
      .bind(projectId)
      .all<SiteEventRow>();
    const now = nowIso();
    return results.map((row) => mapEvent(row, now));
  }

  async listPublic(projectId: string): Promise<SiteEventWithAvailability[]> {
    const now = nowIso();
    const { results } = await this.db
      .prepare(
        `${PUBLIC_EVENT_SELECT}
         WHERE publication.project_id = ?
         GROUP BY publication.event_id
         ORDER BY
           CASE WHEN publication.ends_at_utc >= ? THEN 0 ELSE 1 END,
           CASE WHEN publication.ends_at_utc >= ? THEN publication.starts_at_utc END ASC,
           CASE WHEN publication.ends_at_utc < ? THEN publication.starts_at_utc END DESC`,
      )
      .bind(projectId, now, now, now)
      .all<SiteEventRow>();
    return results.map((row) => mapEvent(row, now));
  }

  async getAdminById(
    projectId: string,
    eventId: string,
  ): Promise<SiteEventWithAvailability | null> {
    return this.getById(projectId, eventId, false);
  }

  async getPublicById(
    projectId: string,
    eventId: string,
  ): Promise<SiteEventWithAvailability | null> {
    return this.getById(projectId, eventId, true);
  }

  async create(data: CreateSiteEventData): Promise<SiteEventWithAvailability | null> {
    const id = newId();
    const now = nowIso();
    const result = await this.db
      .prepare(
        `INSERT INTO lmwares_events (
          id, project_id, slug, title, summary, description, venue_name, venue_address,
          timezone, starts_at_utc, ends_at_utc, registration_closes_at_utc, capacity,
          status, cover_asset_id, published_at, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?)
        ON CONFLICT(project_id, slug) DO NOTHING`,
      )
      .bind(
        id,
        data.projectId,
        data.slug,
        data.title,
        nullable(data.summary),
        nullable(data.description),
        nullable(data.venueName),
        nullable(data.venueAddress),
        data.timezone,
        data.startsAtUtc,
        data.endsAtUtc,
        nullable(data.registrationClosesAtUtc),
        nullable(data.capacity),
        nullable(data.coverAssetId),
        data.actorEmail,
        data.actorEmail,
        now,
        now,
      )
      .run();
    if ((result.meta.changes ?? 0) < 1) return null;
    return this.getAdminById(data.projectId, id);
  }

  async update(
    projectId: string,
    eventId: string,
    data: SiteEventWriteData,
    actorEmail: string,
  ): Promise<UpdateSiteEventResult> {
    const existing = await this.getAdminById(projectId, eventId);
    if (!existing) return { kind: 'not_found' };
    if (data.capacity !== null && data.capacity < existing.registrationCount) {
      return {
        kind: 'capacity_below_confirmed',
        confirmed: existing.registrationCount,
      };
    }

    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE OR IGNORE lmwares_events SET
          slug = ?,
          title = ?,
          summary = ?,
          description = ?,
          venue_name = ?,
          venue_address = ?,
          timezone = ?,
          starts_at_utc = ?,
          ends_at_utc = ?,
          registration_closes_at_utc = ?,
          capacity = ?,
          cover_asset_id = ?,
          updated_by = ?,
          updated_at = ?
         WHERE id = ? AND project_id = ?
           AND (
             ? IS NULL
             OR ? >= (
               SELECT COUNT(*)
               FROM lmwares_event_registrations
               WHERE event_id = lmwares_events.id AND status = 'confirmed'
             )
           )`,
      )
      .bind(
        data.slug,
        data.title,
        nullable(data.summary),
        nullable(data.description),
        nullable(data.venueName),
        nullable(data.venueAddress),
        data.timezone,
        data.startsAtUtc,
        data.endsAtUtc,
        nullable(data.registrationClosesAtUtc),
        nullable(data.capacity),
        nullable(data.coverAssetId),
        actorEmail,
        now,
        eventId,
        projectId,
        nullable(data.capacity),
        nullable(data.capacity),
      )
      .run();

    if ((result.meta.changes ?? 0) < 1) {
      const slugOwner = await this.getBySlug(projectId, data.slug);
      if (slugOwner && slugOwner.id !== eventId) return { kind: 'slug_conflict' };
      const current = await this.getAdminById(projectId, eventId);
      if (!current) return { kind: 'not_found' };
      return {
        kind: 'capacity_below_confirmed',
        confirmed: current.registrationCount,
      };
    }

    const event = await this.getAdminById(projectId, eventId);
    return event ? { kind: 'updated', event } : { kind: 'not_found' };
  }

  async setStatus(
    projectId: string,
    eventId: string,
    status: SiteEventStatus,
    actorEmail: string,
  ): Promise<SiteEventWithAvailability | null> {
    const existing = await this.getAdminById(projectId, eventId);
    if (!existing) return null;
    const now = nowIso();
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `UPDATE lmwares_events SET
          status = ?,
          published_at = CASE
            WHEN ? = 'published' THEN COALESCE(published_at, ?)
            ELSE published_at
          END,
          updated_by = ?,
          updated_at = ?
         WHERE id = ? AND project_id = ?`,
      )
      .bind(status, status, now, actorEmail, now, eventId, projectId),
    ];
    if (status === 'published') {
      statements.push(
        eventPublicationUpsertStatement(this.db, existing, {
          status,
          publishedAt: now,
        }),
      );
    } else if (status === 'cancelled' || status === 'completed') {
      statements.push(
        this.db
          .prepare(
            `UPDATE lmwares_event_publications
             SET status = ?
             WHERE event_id = ? AND project_id = ?`,
          )
          .bind(status, eventId, projectId),
      );
    }
    const [result] = await this.db.batch(statements);
    if ((result?.meta.changes ?? 0) < 1) return null;
    return this.getAdminById(projectId, eventId);
  }

  async listRegistrations(projectId: string, eventId: string): Promise<SiteEventRegistration[]> {
    const { results } = await this.db
      .prepare(
        `SELECT r.*
         FROM lmwares_event_registrations r
         INNER JOIN lmwares_events e ON e.id = r.event_id
         WHERE e.project_id = ? AND e.id = ?
         ORDER BY
           CASE r.status WHEN 'confirmed' THEN 0 ELSE 1 END,
           r.created_at ASC`,
      )
      .bind(projectId, eventId)
      .all<SiteEventRegistrationRow>();
    return results.map(mapRegistration);
  }

  async setRegistrationStatus(
    projectId: string,
    eventId: string,
    registrationId: string,
    status: SiteEventRegistrationStatus,
  ): Promise<UpdateRegistrationResult> {
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmwares_event_registrations SET status = ?, updated_at = ?
         WHERE id = ? AND event_id = ?
           AND EXISTS (
             SELECT 1 FROM lmwares_events
             WHERE id = ? AND project_id = ?
           )
           AND (
             ? <> 'confirmed'
             OR lmwares_event_registrations.status = 'confirmed'
             OR EXISTS (
               SELECT 1
               FROM lmwares_event_publications publication
               WHERE publication.event_id = ?
                 AND publication.status = 'published'
                 AND (
                   publication.capacity IS NULL
                   OR (
                     SELECT COUNT(*)
                     FROM lmwares_event_registrations current
                     WHERE current.event_id = publication.event_id AND current.status = 'confirmed'
                   ) < publication.capacity
                 )
             )
           )`,
      )
      .bind(status, now, registrationId, eventId, eventId, projectId, status, eventId)
      .run();

    if ((result.meta.changes ?? 0) > 0) {
      const registration = await this.getRegistration(eventId, registrationId);
      return registration ? { kind: 'updated', registration } : { kind: 'not_found' };
    }
    const registration = await this.getRegistration(eventId, registrationId);
    return registration ? { kind: 'full' } : { kind: 'not_found' };
  }

  /**
   * La decisión de cupo y la inserción ocurren en una sola sentencia. El batch
   * añade el diagnóstico en la misma transacción D1, sin abrir una ventana de
   * lectura/escritura que permita superar la capacidad.
   */
  async register(data: RegisterForSiteEventData): Promise<RegisterForSiteEventResult> {
    const id = newId();
    const now = nowIso();
    const emailNormalized = data.email.trim().toLowerCase();

    const [insertResult, diagnosticResult] = await this.db.batch<RegistrationDiagnosticRow>([
      this.db
        .prepare(
          `INSERT INTO lmwares_event_registrations (
              id, event_id, full_name, email, email_normalized, phone, notes,
              status, created_at, updated_at
            )
            SELECT ?1, publication.event_id, ?4, ?5, ?6, ?7, ?8, 'confirmed', ?9, ?9
            FROM lmwares_event_publications publication
            WHERE publication.event_id = ?2
              AND publication.project_id = ?3
              AND publication.status = 'published'
              AND publication.starts_at_utc > ?9
              AND (
                publication.registration_closes_at_utc IS NULL
                OR publication.registration_closes_at_utc > ?9
              )
              AND NOT EXISTS (
                SELECT 1
                FROM lmwares_event_registrations duplicate
                WHERE duplicate.event_id = publication.event_id
                  AND duplicate.email_normalized = ?6
              )
              AND (
                publication.capacity IS NULL
                OR (
                  SELECT COUNT(*)
                  FROM lmwares_event_registrations confirmed
                  WHERE confirmed.event_id = publication.event_id AND confirmed.status = 'confirmed'
                ) < publication.capacity
              )
            ON CONFLICT(event_id, email_normalized) DO NOTHING`,
        )
        .bind(
          id,
          data.eventId,
          data.projectId,
          data.fullName,
          data.email,
          emailNormalized,
          nullable(data.phone),
          nullable(data.notes),
          now,
        ),
      this.db
        .prepare(
          `SELECT
              publication.status,
              publication.starts_at_utc,
              publication.registration_closes_at_utc,
              publication.capacity,
              (
                SELECT COUNT(*)
                FROM lmwares_event_registrations confirmed
                WHERE confirmed.event_id = publication.event_id AND confirmed.status = 'confirmed'
              ) AS registration_count,
              EXISTS (
                SELECT 1
                FROM lmwares_event_registrations duplicate
                WHERE duplicate.event_id = publication.event_id
                  AND duplicate.email_normalized = ?
              ) AS duplicate_exists
             FROM lmwares_event_publications publication
             WHERE publication.event_id = ? AND publication.project_id = ?
             LIMIT 1`,
        )
        .bind(emailNormalized, data.eventId, data.projectId),
    ]);

    if ((insertResult?.meta.changes ?? 0) > 0) {
      const [registration, event] = await Promise.all([
        this.getRegistration(data.eventId, id),
        this.getPublicById(data.projectId, data.eventId),
      ]);
      if (registration && event) {
        return { kind: 'created', registration, event };
      }
      return { kind: 'not_found' };
    }

    const diagnostic = diagnosticResult?.results[0];
    if (!diagnostic) return { kind: 'not_found' };
    if (diagnostic.duplicate_exists === 1) return { kind: 'already_registered' };
    if (diagnostic.status !== 'published') {
      return { kind: 'unavailable', status: diagnostic.status as SiteEventStatus };
    }
    if (
      diagnostic.starts_at_utc <= now ||
      (diagnostic.registration_closes_at_utc !== null &&
        diagnostic.registration_closes_at_utc <= now)
    ) {
      return { kind: 'unavailable', status: 'published' };
    }
    if (diagnostic.capacity !== null && diagnostic.registration_count >= diagnostic.capacity) {
      return { kind: 'full' };
    }
    return { kind: 'unavailable', status: 'published' };
  }

  private async getById(
    projectId: string,
    eventId: string,
    publicOnly: boolean,
  ): Promise<SiteEventWithAvailability | null> {
    const select = publicOnly ? PUBLIC_EVENT_SELECT : EVENT_SELECT;
    const alias = publicOnly ? 'publication' : 'e';
    const row = await this.db
      .prepare(
        `${select}
         WHERE ${alias}.project_id = ? AND ${publicOnly ? `${alias}.event_id` : `${alias}.id`} = ?
         GROUP BY ${publicOnly ? `${alias}.event_id` : `${alias}.id`}
         LIMIT 1`,
      )
      .bind(projectId, eventId)
      .first<SiteEventRow>();
    return row ? mapEvent(row, nowIso()) : null;
  }

  private async getBySlug(projectId: string, slug: string): Promise<SiteEvent | null> {
    const row = await this.db
      .prepare(
        `${EVENT_SELECT}
         WHERE e.project_id = ? AND e.slug = ?
         GROUP BY e.id
         LIMIT 1`,
      )
      .bind(projectId, slug)
      .first<SiteEventRow>();
    return row ? mapEvent(row, nowIso()) : null;
  }

  private async getRegistration(
    eventId: string,
    registrationId: string,
  ): Promise<SiteEventRegistration | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmwares_event_registrations
         WHERE event_id = ? AND id = ?
         LIMIT 1`,
      )
      .bind(eventId, registrationId)
      .first<SiteEventRegistrationRow>();
    return row ? mapRegistration(row) : null;
  }
}

function eventPublicationUpsertStatement(
  db: D1Database,
  event: SiteEventWithAvailability,
  publication: { status: Extract<SiteEventStatus, 'published'>; publishedAt: string },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO lmwares_event_publications (
         event_id, project_id, slug, title, summary, description, venue_name, venue_address,
         timezone, starts_at_utc, ends_at_utc, registration_closes_at_utc, capacity,
         status, cover_asset_id, event_created_at, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id) DO UPDATE SET
         project_id = excluded.project_id,
         slug = excluded.slug,
         title = excluded.title,
         summary = excluded.summary,
         description = excluded.description,
         venue_name = excluded.venue_name,
         venue_address = excluded.venue_address,
         timezone = excluded.timezone,
         starts_at_utc = excluded.starts_at_utc,
         ends_at_utc = excluded.ends_at_utc,
         registration_closes_at_utc = excluded.registration_closes_at_utc,
         capacity = excluded.capacity,
         status = excluded.status,
         cover_asset_id = excluded.cover_asset_id,
         event_created_at = excluded.event_created_at,
         published_at = excluded.published_at`,
    )
    .bind(
      event.id,
      event.projectId,
      event.slug,
      event.title,
      nullable(event.summary),
      nullable(event.description),
      nullable(event.venueName),
      nullable(event.venueAddress),
      event.timezone,
      event.startsAtUtc,
      event.endsAtUtc,
      nullable(event.registrationClosesAtUtc),
      nullable(event.capacity),
      publication.status,
      nullable(event.coverAssetId),
      event.createdAt,
      publication.publishedAt,
    );
}

function mapEvent(row: SiteEventRow, now: string): SiteEventWithAvailability {
  const registrationCount = Number(row.registration_count);
  const spotsRemaining =
    row.capacity === null ? null : Math.max(0, row.capacity - registrationCount);
  const registrationOpen =
    row.status === 'published' &&
    row.starts_at_utc > now &&
    (row.registration_closes_at_utc === null || row.registration_closes_at_utc > now) &&
    (spotsRemaining === null || spotsRemaining > 0);

  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    venueName: row.venue_name,
    venueAddress: row.venue_address,
    timezone: row.timezone,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    registrationClosesAtUtc: row.registration_closes_at_utc,
    capacity: row.capacity,
    status: row.status as SiteEventStatus,
    coverAssetId: row.cover_asset_id,
    cover:
      row.cover_asset_id && row.cover_asset_key && row.cover_asset_content_type
        ? {
            id: row.cover_asset_id,
            key: row.cover_asset_key,
            contentType: row.cover_asset_content_type,
          }
        : null,
    publishedAt: row.published_at,
    publishedRevisionAt: row.published_revision_at,
    hasUnpublishedChanges: row.has_unpublished_changes === 1,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    registrationCount,
    spotsRemaining,
    registrationOpen,
  };
}

function mapRegistration(row: SiteEventRegistrationRow): SiteEventRegistration {
  return {
    id: row.id,
    eventId: row.event_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    status: row.status as SiteEventRegistrationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
