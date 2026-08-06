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
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/requests/${r.id}`} className="font-semibold text-brand-700 hover:underline">
                      {r.contactName || 'Sin nombre'}
                    </Link>
                    <span className="font-mono text-xs text-gray-400">ID: {r.id.slice(0, 8)}…</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {r.contactEmail} {r.contactPhone ? `· 📞 ${r.contactPhone}` : ''} · <span className="font-medium text-gray-800">{r.type}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    📅 {formatDateTime(r.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-gray-400">{r.source ?? 'public-web'}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
