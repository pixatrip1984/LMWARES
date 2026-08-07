import type { D1Database } from '@cloudflare/workers-types';
import { AppError } from '@starter/domain';

/**
 * Content modules are runtime operations for a paid Starter site, not a
 * generic editor for Oracle's internal project registry.
 */
export async function requireStarterClientRuntime(
  db: D1Database,
  projectId: string,
): Promise<void> {
  const project = await db
    .prepare(`SELECT id FROM lmwares_projects WHERE id = ? LIMIT 1`)
    .bind(projectId)
    .first<{ id: string }>();
  if (!project) throw AppError.notFound('Proyecto');

  const linkedClientProject = await db
    .prepare(
      `SELECT client.id
       FROM lmw_starter_work_orders AS work_order
       INNER JOIN lmw_starter_client_projects AS client
         ON client.work_order_id = work_order.id
       WHERE work_order.project_id = ?
         AND work_order.status <> 'canceled'
         AND client.status <> 'archived'
       LIMIT 1`,
    )
    .bind(projectId)
    .first<{ id: string }>();
  if (!linkedClientProject) {
    throw AppError.forbidden(
      'Este proyecto interno aún no está enlazado a un proyecto Starter de cliente.',
    );
  }
}
