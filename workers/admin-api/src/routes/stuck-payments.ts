import { Hono } from 'hono';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';

export const stuckPayments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Umbral en horas para considerar un pago "atascado": el cron de reconciliación
 * ya tuvo oportunidad de intentarlo varias veces (corre cada hora) y sigue sin
 * resolverse, así que amerita revisión humana.
 */
const STUCK_THRESHOLD_HOURS = 3;

/** GET /admin/stuck-payments — pagos pendientes de reconciliar por más de STUCK_THRESHOLD_HOURS. */
stuckPayments.get('/', async (c) => {
  const repos = createRepositories(c.env.DB);
  const [billingOrders, packageProposals, packageSubscriptions, maintenanceSubscriptions] =
    await Promise.all([
      repos.lmwaresBillingOrders.countStuck(STUCK_THRESHOLD_HOURS),
      repos.lmwaresPayments.countStuck(STUCK_THRESHOLD_HOURS),
      repos.lmwaresSubscriptions.countStuck(STUCK_THRESHOLD_HOURS),
      repos.lmwaresMaintenanceSubscriptions.countStuck(STUCK_THRESHOLD_HOURS),
    ]);
  const total = billingOrders + packageProposals + packageSubscriptions + maintenanceSubscriptions;
  return c.json({
    total,
    thresholdHours: STUCK_THRESHOLD_HOURS,
    byType: {
      billingOrders,
      packageProposals,
      packageSubscriptions,
      maintenanceSubscriptions,
    },
  });
});
