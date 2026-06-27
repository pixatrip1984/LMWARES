import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AppError,
  REQUEST_STATUSES,
  type Request,
  type RequestNote,
  type RequestStatus,
  type StatusHistory,
} from '@starter/domain';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorBanner,
  Field,
  Spinner,
  StatusBadge,
  Textarea,
} from '@starter/ui';
import { api } from '../lib/api';

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<{ request: Request; notes: RequestNote[]; history: StatusHistory[] } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(await api.getRequest(id));
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof AppError ? err.message : 'No se pudo cargar.'));
  }, [load]);

  if (error && !data) return <ErrorBanner>{error}</ErrorBanner>;
  if (!data) return <Spinner />;
  const { request, notes, history } = data;

  async function changeStatus(status: RequestStatus) {
    await api.updateRequestStatus(id, status);
    await load();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await api.addRequestNote(id, { body: note });
    setNote('');
    await load();
  }

  return (
    <div className="space-y-6">
      <Link to="/requests" className="text-sm text-brand-600">← Solicitudes</Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{request.contactName}</h1>
        <StatusBadge status={request.status} />
      </div>

      <Card>
        <CardHeader>Datos</CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Email</dt><dd>{request.contactEmail}</dd>
            <dt className="text-gray-500">Teléfono</dt><dd>{request.contactPhone ?? '—'}</dd>
            <dt className="text-gray-500">Tipo</dt><dd>{request.type}</dd>
            <dt className="text-gray-500">Mensaje</dt><dd className="whitespace-pre-line">{request.message ?? '—'}</dd>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Cambiar estado</CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {REQUEST_STATUSES.map((s) => (
              <Button key={s} size="sm" variant={s === request.status ? 'primary' : 'secondary'} onClick={() => changeStatus(s)}>
                {s}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Notas internas</CardHeader>
        <CardBody>
          <ul className="mb-4 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
                <span className="font-medium">{n.authorEmail}</span>
                <span className="ml-2 text-gray-400">{new Date(n.createdAt).toLocaleString()}</span>
                <p className="mt-1 whitespace-pre-line text-gray-700">{n.body}</p>
              </li>
            ))}
            {notes.length === 0 ? <li className="text-sm text-gray-500">Sin notas.</li> : null}
          </ul>
          <form onSubmit={addNote}>
            <Field label="Nueva nota">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="submit">Agregar nota</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Historial de estado</CardHeader>
        <CardBody>
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="text-gray-600">
                {h.fromStatus ?? '—'} → <span className="font-medium">{h.toStatus}</span>
                {h.changedBy ? ` · ${h.changedBy}` : ''} · {new Date(h.createdAt).toLocaleString()}
              </li>
            ))}
            {history.length === 0 ? <li className="text-gray-500">Sin cambios.</li> : null}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
