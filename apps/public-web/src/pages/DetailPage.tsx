import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppError } from '@starter/domain';
import type { PublicationDetail } from '@starter/api-client';
import { Card, CardBody, CardHeader, EmptyState, Spinner } from '@starter/ui';
import { api } from '../lib/api';
import { ContactForm } from '../components/ContactForm';

export function DetailPage() {
  const { slug = '' } = useParams();
  const [pub, setPub] = useState<PublicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getPublication(slug)
      .then(setPub)
      .catch((err) =>
        setError(err instanceof AppError && err.code === 'not_found'
          ? 'Publicación no encontrada.'
          : 'No se pudo cargar la publicación.'),
      )
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error || !pub)
    return (
      <div>
        <EmptyState title={error ?? 'No encontrado'} />
        <Link to="/" className="mt-4 inline-block text-brand-600">← Volver al catálogo</Link>
      </div>
    );

  return (
    <article className="space-y-6">
      <Link to="/" className="text-sm text-brand-600">← Catálogo</Link>
      <h1 className="text-3xl font-bold text-gray-900">{pub.title}</h1>
      {pub.summary ? <p className="text-lg text-gray-600">{pub.summary}</p> : null}

      {pub.images.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {pub.images.map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt={img.alt ?? pub.title}
              className="w-full rounded-xl border border-surface-border object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      {pub.body ? <p className="whitespace-pre-line text-gray-800">{pub.body}</p> : null}

      <Card>
        <CardHeader>Solicitar información</CardHeader>
        <CardBody>
          <ContactForm publicationId={pub.id} />
        </CardBody>
      </Card>
    </article>
  );
}
