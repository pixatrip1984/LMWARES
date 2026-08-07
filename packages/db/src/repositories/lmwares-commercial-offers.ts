import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  maintenancePlanTierAmountCents,
  type CommercialOffer,
  type CommercialOfferStatus,
  type MaintenancePlanTier,
  type Metadata,
  type PaidPackageModuleId,
  type PaidPackagePlan,
} from '@starter/domain';
import { boolFromDb, boolToDb, newId, nowIso, parseMetadata } from '../helpers';

interface CommercialOfferRow {
  id: string;
  intake_id: string;
  user_id: string;
  version: number;
  status: string;
  plan: string;
  modules: string;
  marketing: number;
  implementation_amount_cents: number;
  monthly_amount_cents: number;
  maintenance_plan_selected: string | null;
  currency: string;
  scope_summary: string;
  implementation_description: string;
  recurring_description: string;
  maintenance_start_policy: string;
  terms_version: string;
  terms_snapshot: string;
  valid_until: string;
  issued_by: string;
  issued_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export class LmwaresCommercialOffersRepository {
  constructor(private readonly db: D1Database) {}

  async issue(input: {
    intakeId: string;
    plan: PaidPackagePlan;
    modules: PaidPackageModuleId[];
    marketing: boolean;
    implementationAmountCents: number;
    monthlyAmountCents: number;
    scopeSummary: string;
    implementationDescription: string;
    recurringDescription: string;
    termsVersion: string;
    termsSnapshot: Metadata;
    validUntil: string;
    issuedBy: string;
  }): Promise<CommercialOffer> {
    const intake = await this.db
      .prepare(`SELECT user_id, status, maintenance_plan_preference FROM lmw_package_intakes WHERE id = ? LIMIT 1`)
      .bind(input.intakeId)
      .first<{ user_id: string; status: string; maintenance_plan_preference: string }>();
    if (!intake) throw AppError.notFound('Solicitud comercial');
    if (!['scope_review', 'offer_ready'].includes(intake.status)) {
      throw new AppError('conflict', 'La solicitud debe estar en revisión antes de emitir una oferta.');
    }
    // El cliente ya decidió un plan real de mantenimiento en el configurador:
    // el monto mensual se deriva de ese plan, no del número que teclee el
    // operador. Si el cliente eligió "configurar luego", la mensualidad queda
    // pendiente (monto 0, sin plan) hasta que el cliente elija en su pantalla
    // de autorización.
    const preference = intake.maintenance_plan_preference;
    const maintenancePlanSelected: MaintenancePlanTier | null =
      preference === 'none' || preference === 'basic' || preference === 'advanced' ? preference : null;
    const monthlyAmountCents = maintenancePlanSelected
      ? maintenancePlanTierAmountCents(maintenancePlanSelected)
      : 0;
    // El texto legal debe reflejar el monto real derivado del plan del
    // cliente, no el que el operador haya tecleado en el formulario.
    const termsSnapshot: Metadata = {
      ...input.termsSnapshot,
      recurringStart: monthlyAmountCents > 0
        ? 'La mensualidad comienza al publicar el proyecto, no durante la construcción.'
        : preference === 'later'
          ? 'El cliente eligió decidir su plan de mantenimiento más adelante; lo elegirá en su pantalla de autorización antes de publicar.'
          : 'Esta oferta es de pago único y no crea una mensualidad de mantenimiento.',
      cancellation: monthlyAmountCents > 0
        ? 'La cancelación de la mensualidad detiene el mantenimiento futuro; no revierte trabajo de implementación ya entregado.'
        : 'No existen renovaciones automáticas ni cobros futuros asociados a esta oferta.',
    };
    const accepted = await this.db
      .prepare(`SELECT id FROM lmw_commercial_offers WHERE intake_id = ? AND status = 'accepted' LIMIT 1`)
      .bind(input.intakeId)
      .first<{ id: string }>();
    if (accepted) throw new AppError('conflict', 'La solicitud ya tiene una oferta aceptada.');

    const latest = await this.db
      .prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM lmw_commercial_offers WHERE intake_id = ?`)
      .bind(input.intakeId)
      .first<{ version: number }>();
    const id = newId();
    const notificationId = newId();
    const version = (latest?.version ?? 0) + 1;
    const now = nowIso();
    const notificationPayload = JSON.stringify({
      kind: 'commercial-offer-issued',
      offerId: id,
      intakeId: input.intakeId,
      plan: input.plan,
      version,
      implementationAmountCents: input.implementationAmountCents,
      monthlyAmountCents,
      maintenancePlanSelected,
      currency: 'MXN',
      validUntil: input.validUntil,
    });

    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmw_commercial_offers
           SET status = 'superseded', updated_at = ?
           WHERE intake_id = ? AND status = 'issued'
             AND EXISTS (
               SELECT 1 FROM lmw_package_intakes
               WHERE id = ? AND status IN ('scope_review', 'offer_ready')
             )`,
        )
        .bind(now, input.intakeId, input.intakeId),
      this.db
        .prepare(
          `INSERT INTO lmw_commercial_offers
            (id, intake_id, user_id, version, status, plan, modules, marketing,
             implementation_amount_cents, monthly_amount_cents, maintenance_plan_selected, currency,
             scope_summary, implementation_description, recurring_description,
             maintenance_start_policy, terms_version, terms_snapshot, valid_until,
             issued_by, issued_at, created_at, updated_at)
           SELECT ?, id, user_id, ?, 'issued', ?, ?, ?, ?, ?, ?, 'MXN', ?, ?, ?,
                  'on_go_live', ?, ?, ?, ?, ?, ?, ?
           FROM lmw_package_intakes
           WHERE id = ? AND status IN ('scope_review', 'offer_ready')`,
        )
        .bind(
          id,
          version,
          input.plan,
          JSON.stringify(input.modules),
          boolToDb(input.marketing),
          input.implementationAmountCents,
          monthlyAmountCents,
          maintenancePlanSelected,
          input.scopeSummary,
          input.implementationDescription,
          input.recurringDescription,
          input.termsVersion,
          JSON.stringify(termsSnapshot),
          input.validUntil,
          input.issuedBy,
          now,
          now,
          now,
          input.intakeId,
        ),
      this.db
        .prepare(
          `UPDATE lmw_package_intakes
           SET status = 'offer_ready', updated_at = ?
           WHERE id = ? AND status IN ('scope_review', 'offer_ready')`,
        )
        .bind(now, input.intakeId),
      this.db
        .prepare(
          `INSERT INTO lmw_notifications
            (id, user_id, intake_id, channel, template, to_address, dedupe_key,
             status, attempt, max_attempts, next_attempt_at, payload, sent_at,
             created_at, updated_at)
           SELECT ?, id, NULL, 'in_app', 'commercial-offer-issued', email, ?,
                  'sent', 0, 1, NULL, ?, ?, ?, ?
           FROM lmw_users
           WHERE id = ?
             AND EXISTS (SELECT 1 FROM lmw_commercial_offers WHERE id = ?)`,
        )
        .bind(
          notificationId,
          `commercial-offer-issued:${id}`,
          notificationPayload,
          now,
          now,
          now,
          intake.user_id,
          id,
        ),
    ]);
    if ((results[1]?.meta.changes ?? 0) !== 1 || (results[2]?.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'La solicitud cambió mientras se emitía la oferta.');
    }
    return (await this.getById(id))!;
  }

  async accept(input: {
    id: string;
    intakeId: string;
    userId: string;
    termsVersion: string;
  }): Promise<{ offer: CommercialOffer; changed: boolean }> {
    const current = await this.getById(input.id);
    if (
      !current ||
      current.userId !== input.userId ||
      current.intakeId !== input.intakeId
    ) {
      throw AppError.notFound('Oferta comercial');
    }
    if (current.termsVersion !== input.termsVersion) {
      throw new AppError('conflict', 'Los términos de la oferta cambiaron. Vuelve a revisarla.');
    }
    if (current.status === 'accepted') return { offer: current, changed: false };
    if (current.status !== 'issued') {
      throw new AppError('conflict', 'Esta versión de la oferta ya no se puede aceptar.');
    }
    const now = nowIso();
    if (Date.parse(current.validUntil) <= Date.parse(now)) {
      await this.db
        .prepare(`UPDATE lmw_commercial_offers SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'issued'`)
        .bind(now, input.id)
        .run();
      throw new AppError('conflict', 'La oferta venció. Solicita una versión actualizada.');
    }
    const result = await this.db
      .prepare(
        `UPDATE lmw_commercial_offers
         SET status = 'accepted', accepted_at = ?, updated_at = ?
         WHERE id = ? AND intake_id = ? AND user_id = ?
           AND status = 'issued' AND terms_version = ?`,
      )
      .bind(now, now, input.id, input.intakeId, input.userId, input.termsVersion)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'La oferta cambió mientras intentabas aceptarla.');
    }
    return { offer: (await this.getById(input.id))!, changed: true };
  }

  async getById(id: string): Promise<CommercialOffer | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_commercial_offers WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<CommercialOfferRow>();
    return row ? mapCommercialOffer(row) : null;
  }

  async listForIntake(intakeId: string): Promise<CommercialOffer[]> {
    const result = await this.db
      .prepare(`SELECT * FROM lmw_commercial_offers WHERE intake_id = ? ORDER BY version DESC`)
      .bind(intakeId)
      .all<CommercialOfferRow>();
    return result.results.map(mapCommercialOffer);
  }

  async listCurrentForUser(userId: string): Promise<CommercialOffer[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_commercial_offers
         WHERE user_id = ? AND status IN ('issued', 'accepted')
         ORDER BY intake_id, CASE status WHEN 'accepted' THEN 0 ELSE 1 END, version DESC`,
      )
      .bind(userId)
      .all<CommercialOfferRow>();
    const seen = new Set<string>();
    return result.results.map(mapCommercialOffer).filter((offer) => {
      if (seen.has(offer.intakeId)) return false;
      seen.add(offer.intakeId);
      return true;
    });
  }

  /**
   * El cliente eligió "configurar luego" al llenar el brief, así que la
   * oferta aceptada quedó con `maintenance_plan_selected = NULL` y monto 0.
   * Esta es la única vía para fijar el plan real: solo funciona una vez
   * (mientras siga pendiente) y solo sobre la oferta aceptada del cliente.
   */
  async selectMaintenancePlan(input: {
    offerId: string;
    userId: string;
    plan: MaintenancePlanTier;
  }): Promise<{ offer: CommercialOffer; changed: boolean }> {
    const current = await this.getById(input.offerId);
    if (!current || current.userId !== input.userId) {
      throw AppError.notFound('Oferta comercial');
    }
    if (current.status !== 'accepted') {
      throw new AppError('conflict', 'La oferta todavía no está aceptada.');
    }
    if (current.maintenancePlanSelected !== null) {
      return { offer: current, changed: false };
    }
    const amountCents = maintenancePlanTierAmountCents(input.plan);
    const result = await this.db
      .prepare(
        `UPDATE lmw_commercial_offers
         SET maintenance_plan_selected = ?, monthly_amount_cents = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'accepted' AND maintenance_plan_selected IS NULL`,
      )
      .bind(input.plan, amountCents, nowIso(), input.offerId, input.userId)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'El plan de mantenimiento ya fue decidido.');
    }
    return { offer: (await this.getById(input.offerId))!, changed: true };
  }
}

function mapCommercialOffer(row: CommercialOfferRow): CommercialOffer {
  return {
    id: row.id,
    intakeId: row.intake_id,
    userId: row.user_id,
    version: row.version,
    status: row.status as CommercialOfferStatus,
    plan: row.plan as PaidPackagePlan,
    modules: parseModules(row.modules),
    marketing: boolFromDb(row.marketing),
    implementationAmountCents: row.implementation_amount_cents,
    monthlyAmountCents: row.monthly_amount_cents,
    maintenancePlanSelected: (row.maintenance_plan_selected as MaintenancePlanTier | null) ?? null,
    currency: 'MXN',
    scopeSummary: row.scope_summary,
    implementationDescription: row.implementation_description,
    recurringDescription: row.recurring_description,
    maintenanceStartPolicy: 'on_go_live',
    termsVersion: row.terms_version,
    termsSnapshot: parseMetadata(row.terms_snapshot),
    validUntil: row.valid_until,
    issuedBy: row.issued_by,
    issuedAt: row.issued_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseModules(value: string): PaidPackageModuleId[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as PaidPackageModuleId[]) : [];
  } catch {
    return [];
  }
}
