import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, PageHeader, Spinner } from '@starter/ui';
import { api } from '../lib/api';

export function DashboardPage() {
  const [counts, setCounts] = useState<{ pubs: number; reqs: number } | null>(null);

  useEffect(() => {
    Promise.all([
      api.listPublications({ page: 1, pageSize: 1 }),
      api.listRequests({ page: 1, pageSize: 1 }),
    ])
      .then(([p, r]) => setCounts({ pubs: p.total, reqs: r.total }))
      .catch(() => setCounts({ pubs: 0, reqs: 0 }));
  }, []);

  return (
    <div>
      <PageHeader title="Panel" subtitle="Resumen del proyecto" />
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
