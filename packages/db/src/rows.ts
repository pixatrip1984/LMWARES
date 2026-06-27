/**
 * Formas crudas de las filas de D1 (snake_case, JSON como TEXT, bool como 0/1).
 * Deben mantenerse en sync con infra/d1/migrations.
 */
export interface PublicationRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  status: string;
  cover_image_id: string | null;
  metadata: string | null;
  sort_order: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicationImageRow {
  id: string;
  publication_id: string;
  file_asset_id: string;
  alt: string | null;
  position: number;
  created_at: string;
}

export interface PublicationImageJoinRow extends PublicationImageRow {
  key: string;
  content_type: string;
}

export interface RequestRow {
  id: string;
  type: string;
  status: string;
  publication_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  message: string | null;
  payload: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestNoteRow {
  id: string;
  request_id: string;
  author_email: string;
  body: string;
  created_at: string;
}

export interface StatusHistoryRow {
  id: string;
  entity_type: string;
  entity_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface AuditEventRow {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: number;
  last_login_at: string | null;
  created_at: string;
}

export interface FileAssetRow {
  id: string;
  key: string;
  bucket: string;
  content_type: string;
  size_bytes: number;
  original_name: string | null;
  checksum: string | null;
  created_by: string | null;
  created_at: string;
}
