import type {
  AdminUser,
  AdminRole,
  ActorType,
  AuditEvent,
  EntityType,
  FileAsset,
  FreeContactMethod,
  FreeGenerationJob,
  FreeIntake,
  FreeIntakeAsset,
  FreeAssetSafetyStatus,
  FreeContactPlatform,
  FreeGenerationJobStatus,
  FreeIntakeStatus,
  LmwaresApproval,
  LmwaresApprovalDecision,
  LmwaresApprovalGate,
  LmwaresProject,
  LmwaresProjectPhase,
  LmwaresProjectPreview,
  LmwaresProjectSnapshot,
  LmwaresProjectHealth,
  LmwaresProjectPriority,
  LmwaresSnapshotKind,
  LmwaresValidationKind,
  LmwaresValidationResult,
  LmwaresValidationStatus,
  Publication,
  PublicUser,
  PublicationImage,
  PublicationStatus,
  Request,
  RequestNote,
  RequestStatus,
  StatusHistory,
} from '@starter/domain';
import { boolFromDb, parseMetadata } from './helpers';
import { parseJson } from './helpers';
import type {
  AdminUserRow,
  AuditEventRow,
  FileAssetRow,
  FreeContactMethodRow,
  FreeGenerationJobRow,
  FreeIntakeAssetRow,
  FreeIntakeRow,
  LmwaresApprovalRow,
  LmwaresProjectRow,
  LmwaresProjectSnapshotRow,
  LmwaresValidationResultRow,
  PublicationImageJoinRow,
  PublicationImageRow,
  PublicationRow,
  PublicUserRow,
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

export function mapLmwaresProject(r: LmwaresProjectRow): LmwaresProject {
  return {
    id: r.id,
    name: r.name,
    business: r.business,
    category: r.category,
    statusLabel: r.status_label,
    phase: r.phase,
    progress: r.progress,
    priority: r.priority as LmwaresProjectPriority,
    health: r.health as LmwaresProjectHealth,
    repo: r.repo_path,
    branch: r.branch,
    previewUrl: r.preview_url,
    lastRefresh: r.last_refresh,
    developer: r.developer,
    due: r.due,
    day: r.day,
    daysLeft: r.days_left,
    nextAction: r.next_action,
    seedPrompt: r.seed_prompt,
    tags: parseJson<string[]>(r.tags, []),
    preview: parseJson<LmwaresProjectPreview>(r.preview, {
      title: r.name,
      subtitle: '',
      layout: 'service',
      palette: '#536158',
    }),
    phases: parseJson<LmwaresProjectPhase[]>(r.phases, []),
    registrySource: r.registry_source,
    manifestPath: r.manifest_path,
    scanMetadata: parseMetadata(r.scan_metadata),
    firstSeenAt: r.first_seen_at,
    lastScannedAt: r.last_scanned_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapLmwaresProjectSnapshot(r: LmwaresProjectSnapshotRow): LmwaresProjectSnapshot {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind as LmwaresSnapshotKind,
    label: r.label,
    summary: r.summary,
    sourceRevision: r.source_revision,
    previewUrl: r.preview_url,
    artifactPath: r.artifact_path,
    metadata: parseMetadata(r.metadata),
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function mapLmwaresValidationResult(r: LmwaresValidationResultRow): LmwaresValidationResult {
  return {
    id: r.id,
    projectId: r.project_id,
    snapshotId: r.snapshot_id,
    kind: r.kind as LmwaresValidationKind,
    status: r.status as LmwaresValidationStatus,
    label: r.label,
    summary: r.summary,
    sourceRevision: r.source_revision,
    artifactPath: r.artifact_path,
    metadata: parseMetadata(r.metadata),
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function mapLmwaresApproval(r: LmwaresApprovalRow): LmwaresApproval {
  return {
    id: r.id,
    projectId: r.project_id,
    snapshotId: r.snapshot_id,
    gate: r.gate as LmwaresApprovalGate,
    decision: r.decision as LmwaresApprovalDecision,
    comment: r.comment,
    metadata: parseMetadata(r.metadata),
    decidedBy: r.decided_by,
    createdAt: r.created_at,
  };
}

export function mapFreeIntake(r: FreeIntakeRow): FreeIntake {
  return {
    id: r.id,
    userId: r.user_id,
    slug: r.slug,
    siteName: r.site_name,
    status: r.status as FreeIntakeStatus,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    businessDescription: r.business_description,
    audience: r.audience,
    sector: r.sector,
    style: r.style,
    primaryAction: r.primary_action,
    requestId: r.request_id,
    termsAcceptedAt: r.terms_accepted_at,
    publishedUrl: r.published_url,
    qrAssetId: r.qr_asset_id,
    generationJobId: r.generation_job_id,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    metadata: parseMetadata(r.metadata),
    submittedAt: r.submitted_at,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapPublicUser(r: PublicUserRow): PublicUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    pictureUrl: r.picture_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapFreeContactMethod(r: FreeContactMethodRow): FreeContactMethod {
  return {
    id: r.id,
    intakeId: r.intake_id,
    platform: r.platform as FreeContactPlatform,
    value: r.value,
    label: r.label,
    publicVisible: boolFromDb(r.public_visible),
    position: r.position,
    createdAt: r.created_at,
  };
}

export function mapFreeIntakeAsset(r: FreeIntakeAssetRow): FreeIntakeAsset {
  return {
    id: r.id,
    intakeId: r.intake_id,
    fileAssetId: r.file_asset_id,
    sanitizedFileAssetId: r.sanitized_file_asset_id,
    role: r.role,
    position: r.position,
    safetyStatus: r.safety_status as FreeAssetSafetyStatus,
    checksum: r.checksum,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
  };
}

export function mapFreeGenerationJob(r: FreeGenerationJobRow): FreeGenerationJob {
  return {
    id: r.id,
    intakeId: r.intake_id,
    type: r.type,
    status: r.status as FreeGenerationJobStatus,
    attempt: r.attempt,
    leaseUntil: r.lease_until,
    claimedBy: r.claimed_by,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    metadata: parseMetadata(r.metadata),
    queuedAt: r.queued_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
