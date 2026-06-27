import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppError, type Publication } from '@starter/domain';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
  StatusBadge,
} from '@starter/ui';
import { api } from '../lib/api';

export function PublicationsPage() {
  const [items, setItems] = useState<Publication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: '', title: '', summary: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await api.listPublications({ page: 1, pageSize: 50 });
    setItems(res.items);
  }
  useEffect(() => {
    load().catch(() => setError('No se pudo cargar.'));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.createPublication({
        slug: form.slug,
        title: form.title,
        summary: form.summary || null,
        status: 'draft',
        metadata: {},
        sortOrder: 0,
      });
      setForm({ slug: '', title: '', summary: '' });
      await load();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Error al crear.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Publicaciones" />

      <Card>
        <CardHeader>Nueva publicación</CardHeader>
        <CardBody>
          {error ? <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div> : null}
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-3">
            <Field label="Slug">
              <Input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="mi-item" />
            </Field>
            <Field label="Título">
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Resumen">
              <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={saving}>{saving ? 'Creando…' : 'Crear'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Sin publicaciones" />
      ) : (
        <Card>
          <ul className="divide-y divide-surface-border">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <Link to={`/publications/${p.id}`} className="font-medium text-brand-700">{p.title}</Link>
                  <p className="text-sm text-gray-500">/{p.slug}</p>
                </div>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
