import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, PageHeader, Spinner } from '@starter/ui';
import { api } from '../lib/api';
import type { StuckPaymentsSummary } from '@starter/api-client';

export function DashboardPage() {
  const [counts, setCounts] = useState<{ pubs: number; reqs: number } | null>(null);
  const [stuckPayments, setStuckPayments] = useState<StuckPaymentsSummary | null>(null);

  useEffect(() => {
    Promise.all([
      api.listPublications({ page: 1, pageSize: 1 }),
      api.listRequests({ page: 1, pageSize: 1 }),
    ])
      .then(([p, r]) => setCounts({ pubs: p.total, reqs: r.total }))
      .catch(() => setCounts({ pubs: 0, reqs: 0 }));
    api
      .getStuckPayments()
      .then(setStuckPayments)
      .catch(() => setStuckPayments(null));
  }, []);

  return (
    <div>
      <PageHeader title="Panel" subtitle="Resumen del proyecto" />
      {stuckPayments && stuckPayments.total > 0 ? (
        <Card className="mb-4 border-l-4 border-red-500 bg-red-50">
          <CardBody>
            <p className="text-sm font-medium text-red-700">
              ⚠️ {stuckPayments.total} pago{stuckPayments.total === 1 ? '' : 's'} sin confirmar hace más
              de {stuckPayments.thresholdHours}h
            </p>
            <p className="mt-1 text-xs text-red-600">
              Fases: {stuckPayments.byType.billingOrders} · Paquetes:{' '}
              {stuckPayments.byType.packageProposals} · Mensualidades paquete:{' '}
              {stuckPayments.byType.packageSubscriptions} · Mensualidades mantenimiento:{' '}
              {stuckPayments.byType.maintenanceSubscriptions}
            </p>
            <p className="mt-1 text-xs text-red-500">
              El cron ya lo intentó reconciliar automáticamente sin éxito; revisa el estado en
              Mercado Pago o contacta al cliente.
            </p>
          </CardBody>
        </Card>
      ) : null}
      {!counts ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/publications">
            <Card className="transition-shadow hover:shadow-md">
              <CardBody>
                <p className="text-sm text-gray-500">Publicaciones</p>
                <p className="text-3xl font-bold text-gray-900">{counts.pubs}</p>
              </CardBody>
            </Card>
          </Link>
          <Link to="/requests">
            <Card className="transition-shadow hover:shadow-md">
              <CardBody>
                <p className="text-sm text-gray-500">Solicitudes</p>
                <p className="text-3xl font-bold text-gray-900">{counts.reqs}</p>
              </CardBody>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
