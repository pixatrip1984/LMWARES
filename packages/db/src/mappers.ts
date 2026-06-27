import type {
  AdminUser,
  AdminRole,
  ActorType,
  AuditEvent,
  EntityType,
  FileAsset,
  Publication,
  PublicationImage,
  PublicationStatus,
  Request,
  RequestNote,
  RequestStatus,
  StatusHistory,
} from '@starter/domain';
import { boolFromDb, parseMetadata } from './helpers';
import type {
  AdminUserRow,
  AuditEventRow,
  FileAssetRow,
  PublicationImageJoinRow,
  PublicationImageRow,
  PublicationRow,
  RequestNoteRow,
  RequestRow,
  StatusHistoryRow,
} from './rows';

export function mapPublication(r: PublicationRow): Publication {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    body: r.body,
    status: r.status as PublicationStatus,
    coverImageId: r.cover_image_id,
    metadata: parseMetadata(r.metadata),
    sortOrder: r.sort_order,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapPublicationImage(r: PublicationImageRow): PublicationImage {
  return {
    id: r.id,
    publicationId: r.publication_id,
    fileAssetId: r.file_asset_id,
    alt: r.alt,
    position: r.position,
    createdAt: r.created_at,
  };
}

export function mapPublicationImageJoin(r: PublicationImageJoinRow) {
  return { ...mapPublicationImage(r), key: r.key, contentType: r.content_type };
}

export function mapRequest(r: RequestRow): Request {
  return {
    id: r.id,
    type: r.type,
    status: r.status as RequestStatus,
    publicationId: r.publication_id,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    message: r.message,
    payload: parseMetadata(r.payload),
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapRequestNote(r: RequestNoteRow): RequestNote {
  return {
    id: r.id,
    requestId: r.request_id,
    authorEmail: r.author_email,
    body: r.body,
    createdAt: r.created_at,
  };
}

export function mapStatusHistory(r: StatusHistoryRow): StatusHistory {
  return {
    id: r.id,
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    changedBy: r.changed_by,
    reason: r.reason,
    createdAt: r.created_at,
  };
}

export function mapAuditEvent(r: AuditEventRow): AuditEvent {
  return {
    id: r.id,
    actorType: r.actor_type as ActorType,
    actorId: r.actor_id,
    action: r.action,
    entityType: r.entity_type as EntityType | null,
    entityId: r.entity_id,
    metadata: parseMetadata(r.metadata),
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  };
}

export function mapAdminUser(r: AdminUserRow): AdminUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role as AdminRole,
    active: boolFromDb(r.active),
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  };
}

export function mapFileAsset(r: FileAssetRow): FileAsset {
  return {
    id: r.id,
    key: r.key,
    bucket: r.bucket,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    originalName: r.original_name,
    checksum: r.checksum,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}
