import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Paginated, Publication } from '@starter/domain';
import { Card, CardBody, EmptyState, PageHeader, Spinner, StatusBadge } from '@starter/ui';
import { api } from '../lib/api';

export function CatalogPage() {
  const [data, setData] = useState<Paginated<Publication> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPublications({ page: 1, pageSize: 12 })
      .then(setData)
      .catch(() => setError('No se pudo cargar el catálogo.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Catálogo" subtitle="Publicaciones disponibles" />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <EmptyState title={error} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Aún no hay publicaciones" hint="Crea algunas desde el portal admin." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <Link key={p.id} to={`/p/${p.slug}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardBody>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">{p.title}</h3>
                    <StatusBadge status={p.status} />
                  </div>
                  {p.summary ? <p className="text-sm text-gray-600">{p.summary}</p> : null}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
