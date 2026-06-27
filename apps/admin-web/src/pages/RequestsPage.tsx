import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { REQUEST_STATUSES, type Request, type RequestStatus } from '@starter/domain';
import { Card, EmptyState, PageHeader, Spinner, StatusBadge } from '@starter/ui';
import { api } from '../lib/api';

export function RequestsPage() {
  const [items, setItems] = useState<Request[] | null>(null);
  const [status, setStatus] = useState<RequestStatus | ''>('');

  useEffect(() => {
    setItems(null);
    api
      .listRequests({ page: 1, pageSize: 50, status: status || undefined })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [status]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Solicitudes"
        actions={
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RequestStatus | '')}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        }
      />
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Sin solicitudes" />
      ) : (
        <Card>
          <ul className="divide-y divide-surface-border">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <Link to={`/requests/${r.id}`} className="font-medium text-brand-700">
                    {r.contactName}
                  </Link>
                  <p className="text-sm text-gray-500">{r.contactEmail} · {r.type}</p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
