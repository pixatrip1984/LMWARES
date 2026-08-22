import type { D1Database, D1Result } from '@cloudflare/workers-types';
import {
  AppError,
  type DiscountApplication,
  type DiscountCode,
  type DiscountCodeStatus,
  type DiscountPercent,
  type DiscountRedemption,
  type PaidPackagePlan,
} from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';

interface DiscountCodeRow {
  id: string;
  code: string;
  discount_percent: number;
  plan: string | null;
  status: string;
  max_redemptions: number | null;
  redemption_count: number;
  qr_data: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DiscountRedemptionRow {
  id: string;
  discount_code_id: string;
  intake_id: string | null;
  user_id: string;
  discount_percent: number;
  original_cents: number;
  discounted_cents: number;
  currency: string;
  redeemed_at: string;
  created_at: string;
  updated_at: string;
}

export class LmwaresDiscountCodesRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: {
    code: string;
    discountPercent: DiscountPercent;
    plan: PaidPackagePlan | null;
    maxRedemptions: number | null;
    qrData: string | null;
    expiresAt: string | null;
    createdBy: string;
  }): Promise<DiscountCode> {
    const id = newId();
    const now = nowIso();
    let result: D1Result;
    try {
      result = await this.db
        .prepare(
          `INSERT INTO lmw_discount_codes
            (id, code, discount_percent, plan, status, max_redemptions,
             redemption_count, qr_data, expires_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.code,
          input.discountPercent,
          nullable(input.plan),
          nullable(input.maxRedemptions),
          nullable(input.qrData),
          nullable(input.expiresAt),
          input.createdBy,
          now,
          now,
        )
        .run();
    } catch (error) {
      // El código es UNIQUE: un duplicado lanza SQLITE_CONSTRAINT en D1.
      // Convertirlo a un AppError de conflicto para que el operador vea un
      // mensaje claro en lugar de un error interno del servidor.
      if (isUniqueConstraintError(error)) {
        throw new AppError('conflict', 'Ya existe un código con ese valor.');
      }
      throw error;
    }
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'Ya existe un código con ese valor.');
    }
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<DiscountCode | null> {
    const row = await this.db
      .prepare('SELECT * FROM lmw_discount_codes WHERE id = ? LIMIT 1')
      .bind(id)
      .first<DiscountCodeRow>();
    return row ? mapDiscountCode(row) : null;
  }

  async getByCode(code: string): Promise<DiscountCode | null> {
    const row = await this.db
      .prepare('SELECT * FROM lmw_discount_codes WHERE code = ? LIMIT 1')
      .bind(code)
      .first<DiscountCodeRow>();
    return row ? mapDiscountCode(row) : null;
  }

  async list(): Promise<DiscountCode[]> {
    const result = await this.db
      .prepare('SELECT * FROM lmw_discount_codes ORDER BY created_at DESC')
      .all<DiscountCodeRow>();
    return result.results.map(mapDiscountCode);
  }

  async setStatus(id: string, status: DiscountCodeStatus): Promise<DiscountCode> {
    const now = nowIso();
    const result = await this.db
      .prepare('UPDATE lmw_discount_codes SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) throw AppError.notFound('Código de descuento');
    return (await this.getById(id))!;
  }

  async delete(id: string): Promise<void> {
    const result = await this.db
      .prepare('DELETE FROM lmw_discount_codes WHERE id = ?')
      .bind(id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) throw AppError.notFound('Código de descuento');
  }

  async getRedemptionById(id: string): Promise<DiscountRedemption | null> {
    const row = await this.db
      .prepare('SELECT * FROM lmw_discount_redemptions WHERE id = ? LIMIT 1')
      .bind(id)
      .first<DiscountRedemptionRow>();
    return row ? mapDiscountRedemption(row) : null;
  }

  async getRedemptionByCodeAndUser(
    discountCodeId: string,
    userId: string,
  ): Promise<DiscountRedemption | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmw_discount_redemptions
         WHERE discount_code_id = ? AND user_id = ? LIMIT 1`,
      )
      .bind(discountCodeId, userId)
      .first<DiscountRedemptionRow>();
    return row ? mapDiscountRedemption(row) : null;
  }

  /** Valida y aplica un código de forma idempotente y protegida por D1. */
  async redeem(input: {
    code: string;
    plan: PaidPackagePlan;
    userId: string;
    intakeId: string | null;
    originalCents: number;
  }): Promise<{ application: DiscountApplication; redemption: DiscountRedemption }> {
    const code = await this.getByCode(input.code);
    if (!code) throw new AppError('not_found', 'El código de descuento no existe.');

    const existing = await this.getRedemptionByCodeAndUser(code.id, input.userId);
    if (existing) {
      if (
        existing.intakeId === input.intakeId &&
        existing.originalCents === input.originalCents &&
        existing.discountPercent === code.discountPercent
      ) {
        return {
          application: toDiscountApplication(code.code, existing),
          redemption: existing,
        };
      }
      throw new AppError('conflict', 'Ya usaste este código de descuento.');
    }

    if (code.plan !== null && code.plan !== input.plan) {
      throw new AppError('validation_error', 'Este código no aplica al plan seleccionado.');
    }

    const now = nowIso();
    const nowMs = Date.parse(now);

    if (code.status === 'disabled') {
      throw new AppError('conflict', 'Este código de descuento está desactivado.');
    }
    if (code.status === 'exhausted') {
      throw new AppError('conflict', 'Este código de descuento ya agotó sus usos.');
    }
    if (code.expiresAt !== null && Date.parse(code.expiresAt) <= nowMs) {
      await this.db
        .prepare(`UPDATE lmw_discount_codes SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'active'`)
        .bind(now, code.id)
        .run();
      throw new AppError('conflict', 'Este código de descuento ya venció.');
    }

    const discountedCents = Math.round(
      input.originalCents * (1 - code.discountPercent / 100),
    );
    const redemptionId = newId();
    try {
      await this.db
        .prepare(
          `INSERT INTO lmw_discount_redemptions
            (id, discount_code_id, intake_id, user_id, discount_percent,
             original_cents, discounted_cents, currency, redeemed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'MXN', ?, ?, ?)`,
        )
        .bind(
          redemptionId,
          code.id,
          nullable(input.intakeId),
          input.userId,
          code.discountPercent,
          input.originalCents,
          discountedCents,
          now,
          now,
          now,
        )
        .run();
    } catch (error) {
      const concurrent = await this.getRedemptionByCodeAndUser(code.id, input.userId);
      if (concurrent) {
        if (
          concurrent.intakeId === input.intakeId &&
          concurrent.originalCents === input.originalCents
        ) {
          return {
            application: toDiscountApplication(code.code, concurrent),
            redemption: concurrent,
          };
        }
        throw new AppError('conflict', 'Ya usaste este código de descuento.');
      }
      if (/discount code unavailable|UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(String(error))) {
        throw new AppError('conflict', 'Este código de descuento ya no está disponible.');
      }
      throw error;
    }

    const redemption = await this.getRedemptionById(redemptionId);
    if (!redemption) throw new AppError('conflict', 'No se pudo registrar el descuento.');
    return {
      application: toDiscountApplication(code.code, redemption),
      redemption,
    };
  }

  /**
   * Valida un código sin consumirlo (para la vista previa del precio en el
   * cotizador). Devuelve el descuento que aplicaría, o lanza si es inválido.
   */
  async preview(input: {
    code: string;
    plan: PaidPackagePlan;
    originalCents: number;
  }): Promise<DiscountApplication> {
    const code = await this.getByCode(input.code);
    if (!code) throw new AppError('not_found', 'El código de descuento no existe.');
    if (code.plan !== null && code.plan !== input.plan) {
      throw new AppError('validation_error', 'Este código no aplica al plan seleccionado.');
    }
    if (code.status !== 'active') {
      throw new AppError('conflict', 'Este código de descuento no está disponible.');
    }
    if (code.expiresAt !== null && Date.parse(code.expiresAt) <= Date.now()) {
      throw new AppError('conflict', 'Este código de descuento ya venció.');
    }
    if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) {
      throw new AppError('conflict', 'Este código de descuento ya agotó sus usos.');
    }
    const discountedCents = Math.round(
      input.originalCents * (1 - code.discountPercent / 100),
    );
    return {
      code: code.code,
      discountPercent: code.discountPercent,
      originalCents: input.originalCents,
      discountedCents,
      discountCents: input.originalCents - discountedCents,
      currency: 'MXN',
    };
  }
}

function mapDiscountCode(row: DiscountCodeRow): DiscountCode {
  return {
    id: row.id,
    code: row.code,
    discountPercent: row.discount_percent as DiscountPercent,
    plan: (row.plan as PaidPackagePlan | null) ?? null,
    status: row.status as DiscountCodeStatus,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    qrData: row.qr_data,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDiscountRedemption(row: DiscountRedemptionRow): DiscountRedemption {
  return {
    id: row.id,
    discountCodeId: row.discount_code_id,
    intakeId: row.intake_id,
    userId: row.user_id,
    discountPercent: row.discount_percent as DiscountPercent,
    originalCents: row.original_cents,
    discountedCents: row.discounted_cents,
    currency: 'MXN',
    redeemedAt: row.redeemed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDiscountApplication(code: string, redemption: DiscountRedemption): DiscountApplication {
  return {
    code,
    discountPercent: redemption.discountPercent,
    originalCents: redemption.originalCents,
    discountedCents: redemption.discountedCents,
    discountCents: redemption.originalCents - redemption.discountedCents,
    currency: 'MXN',
  };
}

/** Detecta un error de violación de restricción UNIQUE de D1/SQLite. */
function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(message);
}
