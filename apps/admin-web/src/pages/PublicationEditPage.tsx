import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppError, PUBLICATION_STATUSES, type PublicationStatus } from '@starter/domain';
import type { AdminPublicationDetail } from '@starter/api-client';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorBanner,
  Field,
  Input,
  Spinner,
  StatusBadge,
  Textarea,
} from '@starter/ui';
import { api } from '../lib/api';

export function PublicationEditPage() {
  const { id = '' } = useParams();
  const [pub, setPub] = useState<AdminPublicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await api.getPublication(id);
    setPub(data);
  }, [id]);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof AppError ? err.message : 'No se pudo cargar.'),
    );
  }, [load]);

  if (error && !pub) return <ErrorBanner>{error}</ErrorBanner>;
  if (!pub) return <Spinner />;

  async function saveFields(e: React.FormEvent) {
    e.preventDefault();
    if (!pub || savingField) return;
    setError(null);
    setSavingField(true);
    try {
      await api.updatePublication(pub.id, {
        title: pub.title,
        slug: pub.slug,
        summary: pub.summary,
        body: pub.body,
        sortOrder: pub.sortOrder,
      });
      await load();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Error al guardar.');
    } finally {
      setSavingField(false);
    }
  }

  async function changeStatus(status: PublicationStatus) {
    if (!pub || changingStatus || status === pub.status) return;
    setError(null);
    setChangingStatus(true);
    try {
      await api.updatePublicationStatus(pub.id, { status });
      await load();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Error al cambiar estado.');
    } finally {
      setChangingStatus(false);
    }
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pub || uploadingImage) return;
    setError(null);
    setUploadingImage(true);
    try {
      await api.uploadPublicationImage(pub.id, file, { position: pub.images.length });
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Error al subir imagen.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function deleteImage(imageId: string) {
    if (!pub || deletingImageId) return;
    setError(null);
    setDeletingImageId(imageId);
    try {
      await api.deletePublicationImage(pub.id, imageId);
      await load();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Error al eliminar imagen.');
    } finally {
      setDeletingImageId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/publications" className="text-sm text-brand-600">← Publicaciones</Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{pub.title}</h1>
        <StatusBadge status={pub.status} />
      </div>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <Card>
        <CardHeader>Estado</CardHeader>
        <CardBody>
          <div className="flex gap-2">
            {PUBLICATION_STATUSES.map((s) => (
              <Button
                key={s}
                variant={s === pub.status ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => changeStatus(s)}
                disabled={changingStatus || s === pub.status}
              >
                {changingStatus && s !== pub.status ? 'Actualizando…' : s}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Contenido</CardHeader>
        <CardBody>
          <form onSubmit={saveFields}>
            <Field label="Título">
              <Input value={pub.title} onChange={(e) => setPub({ ...pub, title: e.target.value })} />
            </Field>
            <Field label="Slug">
              <Input value={pub.slug} onChange={(e) => setPub({ ...pub, slug: e.target.value })} />
            </Field>
            <Field label="Resumen">
              <Input value={pub.summary ?? ''} onChange={(e) => setPub({ ...pub, summary: e.target.value })} />
            </Field>
            <Field label="Cuerpo">
              <Textarea rows={5} value={pub.body ?? ''} onChange={(e) => setPub({ ...pub, body: e.target.value })} />
            </Field>
            <Button type="submit" disabled={savingField}>{savingField ? 'Guardando…' : 'Guardar'}</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Imágenes</CardHeader>
        <CardBody>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pub.images.map((img) => (
              <div key={img.id} className="rounded-lg border border-surface-border p-2">
                <img src={img.url} alt={img.alt ?? ''} className="h-28 w-full rounded object-cover" />
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => deleteImage(img.id)}
                  disabled={deletingImageId !== null}
                >
                  {deletingImageId === img.id ? 'Eliminando…' : 'Eliminar'}
                </Button>
              </div>
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={uploadImage}
            disabled={uploadingImage}
            className="text-sm"
          />
          {uploadingImage ? <p className="mt-2 text-sm text-gray-500">Subiendo imagen…</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}
