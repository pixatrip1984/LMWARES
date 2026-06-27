import type { D1Database } from '@cloudflare/workers-types';
import type { FileAsset } from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';
import { mapFileAsset } from '../mappers';
import type { FileAssetRow } from '../rows';

export interface CreateFileAssetData {
  key: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  originalName?: string | null;
  checksum?: string | null;
  createdBy?: string | null;
}

export class FileAssetsRepository {
  constructor(private readonly db: D1Database) {}

  async create(data: CreateFileAssetData): Promise<FileAsset> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO file_assets
          (id, key, bucket, content_type, size_bytes, original_name, checksum, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.key,
        data.bucket,
        data.contentType,
        data.sizeBytes,
        nullable(data.originalName),
        nullable(data.checksum),
        nullable(data.createdBy),
        now,
      )
      .run();
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<FileAsset | null> {
    const row = await this.db
      .prepare(`SELECT * FROM file_assets WHERE id = ?`)
      .bind(id)
      .first<FileAssetRow>();
    return row ? mapFileAsset(row) : null;
  }

  async getByKey(key: string): Promise<FileAsset | null> {
    const row = await this.db
      .prepare(`SELECT * FROM file_assets WHERE key = ?`)
      .bind(key)
      .first<FileAssetRow>();
    return row ? mapFileAsset(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.prepare(`DELETE FROM file_assets WHERE id = ?`).bind(id).run();
    return (res.meta.changes ?? 0) > 0;
  }
}
