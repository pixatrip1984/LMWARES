import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  galleriesApi,
  type GalleryAlbumDetail,
  type GalleryAlbumSummary,
  type GalleryImageView,
  type GalleryStatus,
} from './galleriesApi';
import './galleriesWorkspace.css';

export interface GalleriesWorkspaceProps {
  projectId: string;
}

interface AlbumDraft {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  category: string;
  sortOrder: number;
  status: GalleryStatus;
  publishedRevisionAt: string | null;
  hasUnpublishedChanges: boolean;
  coverImageId: string | null;
  images: GalleryImageView[];
}

type PreviewSurface = 'albums' | 'album';

const EMPTY_DRAFT: AlbumDraft = {
  id: null,
  slug: '',
  title: '',
  description: '',
  category: 'General',
  sortOrder: 0,
  status: 'draft',
  publishedRevisionAt: null,
  hasUnpublishedChanges: false,
  coverImageId: null,
  images: [],
};

export function GalleriesWorkspace({
  projectId,
}: GalleriesWorkspaceProps) {
  const [albums, setAlbums] = useState<GalleryAlbumSummary[]>([]);
  const [publishedAlbums, setPublishedAlbums] = useState<
    GalleryAlbumSummary[]
  >([]);
  const [draft, setDraft] = useState<AlbumDraft>(EMPTY_DRAFT);
  const [previewSurface, setPreviewSurface] =
    useState<PreviewSurface>('albums');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imagePendingDeletion, setImagePendingDeletion] =
    useState<GalleryImageView | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadWorkspace = useCallback(
    async (preferredAlbumId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await galleriesApi.list(projectId);
        setAlbums(response.albums);
        setPublishedAlbums(response.publishedAlbums);
        const target =
          response.albums.find((album) => album.id === preferredAlbumId) ??
          response.albums[0];
        if (target) {
          const detail = await galleriesApi.get(projectId, target.id);
          setDraft(toDraft(detail));
        } else {
          setDraft({ ...EMPTY_DRAFT });
        }
      } catch (caught) {
        setError(errorMessage(caught, 'No se pudo cargar el módulo.'));
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  async function selectAlbum(albumId: string) {
    if (!albumId) {
      beginNewAlbum();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const detail = await galleriesApi.get(projectId, albumId);
      setDraft(toDraft(detail));
      setPreviewSurface('album');
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo abrir el álbum.'));
    } finally {
      setBusy(false);
    }
  }

  function beginNewAlbum() {
    setDraft({
      ...EMPTY_DRAFT,
      sortOrder: albums.length,
    });
    setError(null);
    setNotice('Completa los datos y guarda el borrador antes de cargar imágenes.');
    setPreviewSurface('album');
  }

  async function persistFields(): Promise<GalleryAlbumDetail> {
    const title = draft.title.trim();
    const slug = draft.slug.trim();
    const category = draft.category.trim();
    if (!title || !slug || !category) {
      throw new Error('Título, slug y categoría son obligatorios.');
    }
    const fields = {
      title,
      slug,
      description: draft.description.trim() || null,
      category,
      sortOrder: draft.sortOrder,
    };
    return draft.id
      ? galleriesApi.update(projectId, draft.id, fields)
      : galleriesApi.create(projectId, fields);
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let saved = await persistFields();
      if (saved.status !== 'draft') {
        saved = await galleriesApi.saveDraft(projectId, saved.id);
      }
      await loadWorkspace(saved.id);
      setNotice(
        saved.publishedRevisionAt
          ? 'Borrador guardado. La versión pública anterior permanece activa hasta volver a publicar.'
          : 'Borrador guardado. Este álbum todavía no tiene una versión pública.',
      );
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo guardar el borrador.'));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await persistFields();
      const published = await galleriesApi.publish(projectId, saved.id);
      await loadWorkspace(published.id);
      setPreviewSurface('album');
      setNotice('Álbum publicado y disponible en la API pública.');
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo publicar el álbum.'));
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!draft.id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const unpublished = await galleriesApi.unpublish(projectId, draft.id);
      await loadWorkspace(unpublished.id);
      setNotice('Álbum retirado de la vista pública y conservado como borrador.');
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo retirar el álbum.'));
    } finally {
      setBusy(false);
    }
  }

  function preview() {
    setPreviewSurface('album');
    setNotice('La vista izquierda refleja los cambios locales antes de guardar.');
    previewRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    if (!draft.id) {
      setError('Guarda primero el borrador para habilitar la carga.');
      event.target.value = '';
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error(`${file.name}: sólo se acepta JPG, PNG o WebP.`);
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`${file.name}: excede el límite de 5 MB.`);
        }
        await galleriesApi.uploadImage(projectId, draft.id, file);
      }
      await loadWorkspace(draft.id);
      setPreviewSurface('album');
      setNotice(
        `${files.length} ${files.length === 1 ? 'imagen cargada' : 'imágenes cargadas'}.`,
      );
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo cargar la imagen.'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setBusy(false);
    }
  }

  async function moveImage(index: number, direction: -1 | 1) {
    if (!draft.id) return;
    const target = index + direction;
    if (target < 0 || target >= draft.images.length) return;
    const next = [...draft.images];
    const currentImage = next[index];
    const targetImage = next[target];
    if (!currentImage || !targetImage) return;
    next[index] = targetImage;
    next[target] = currentImage;
    setDraft((current) => ({ ...current, images: next }));
    setBusy(true);
    try {
      const detail = await galleriesApi.reorderImages(
        projectId,
        draft.id,
        next.map((image) => image.id),
      );
      setDraft(toDraft(detail));
      setNotice('Orden actualizado.');
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo cambiar el orden.'));
      await loadWorkspace(draft.id);
    } finally {
      setBusy(false);
    }
  }

  async function chooseCover(imageId: string) {
    if (!draft.id) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await galleriesApi.setCover(
        projectId,
        draft.id,
        imageId,
      );
      setDraft(toDraft(detail));
      setNotice('Portada actualizada.');
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo elegir la portada.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveAlt(image: GalleryImageView) {
    if (!draft.id) return;
    try {
      await galleriesApi.updateImageAlt(
        projectId,
        draft.id,
        image.id,
        image.alt?.trim() || null,
      );
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo guardar el texto alternativo.'));
    }
  }

  async function deleteImage(imageId: string) {
    if (!draft.id) return;
    setBusy(true);
    setError(null);
    try {
      await galleriesApi.deleteImage(projectId, draft.id, imageId);
      await loadWorkspace(draft.id);
      setNotice('Imagen eliminada de R2 y de la galería.');
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo eliminar la imagen.'));
    } finally {
      setBusy(false);
    }
  }

  const cover =
    draft.images.find((image) => image.id === draft.coverImageId) ??
    draft.images[0] ??
    null;

  return (
    <section className="lmw-galleries-admin" aria-busy={busy || loading}>
      <header className="lmw-galleries-admin__header">
        <div>
          <span className="lmw-galleries-admin__eyebrow">
            LMWARES / MÓDULOS DE SITIO
          </span>
          <h1>Galerías</h1>
          <p>Álbumes visuales para el proyecto {projectId}</p>
        </div>
        <div className="lmw-galleries-admin__header-actions">
          <button type="button" className="is-quiet" onClick={preview}>
            Previsualizar
          </button>
          <button
            type="button"
            className="is-secondary"
            onClick={() => void saveDraft()}
            disabled={busy}
          >
            Guardar borrador
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => void publish()}
            disabled={busy}
          >
            Publicar
          </button>
          {draft.publishedRevisionAt ? (
            <button
              type="button"
              className="is-secondary"
              onClick={() => void unpublish()}
              disabled={busy}
            >
              Retirar
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="lmw-galleries-admin__message is-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="lmw-galleries-admin__message is-notice" role="status">
          {notice}
        </div>
      ) : null}

      <div className="lmw-galleries-admin__split">
        <div
          ref={previewRef}
          className="lmw-galleries-admin__preview-panel"
        >
          <div className="lmw-gallery-browser">
            <div className="lmw-gallery-browser__chrome">
              <div className="lmw-gallery-browser__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <span>/sites/{projectId}/galleries</span>
              <b>Vista pública</b>
            </div>
            <div className="lmw-gallery-browser__toolbar">
              <button
                type="button"
                className={previewSurface === 'albums' ? 'is-active' : ''}
                onClick={() => setPreviewSurface('albums')}
              >
                Álbumes
              </button>
              <button
                type="button"
                className={previewSurface === 'album' ? 'is-active' : ''}
                onClick={() => setPreviewSurface('album')}
              >
                Álbum actual
              </button>
              <span>
                {statusLabel(draft.status, draft.hasUnpublishedChanges)}
              </span>
            </div>

            {loading ? (
              <PreviewLoading />
            ) : previewSurface === 'albums' ? (
              <AlbumIndexPreview albums={publishedAlbums} />
            ) : (
              <AlbumPreview draft={draft} cover={cover} />
            )}
          </div>
        </div>

        <aside className="lmw-galleries-admin__editor">
          <div className="lmw-galleries-admin__selector">
            <label htmlFor="gallery-album-selector">Álbum</label>
            <div>
              <select
                id="gallery-album-selector"
                value={draft.id ?? ''}
                onChange={(event) => void selectAlbum(event.target.value)}
                disabled={busy}
              >
                <option value="">Nuevo álbum</option>
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.title} ·{' '}
                    {statusLabel(album.status, album.hasUnpublishedChanges)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={beginNewAlbum} disabled={busy}>
                + Nuevo
              </button>
            </div>
          </div>

          <div className="lmw-galleries-admin__status-line">
            <span className={`is-${draft.status}`}>
              {statusLabel(draft.status, draft.hasUnpublishedChanges)}
            </span>
            <small>
              {draft.id
                ? `${draft.images.length} imágenes`
                : 'Sin guardar en D1'}
            </small>
          </div>

          <div className="lmw-galleries-admin__fields">
            <label>
              <span>Título</span>
              <input
                value={draft.title}
                maxLength={180}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Colección primavera"
              />
            </label>
            <div className="lmw-galleries-admin__field-row">
              <label>
                <span>Slug</span>
                <input
                  value={draft.slug}
                  maxLength={120}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      slug: slugify(event.target.value),
                    }))
                  }
                  placeholder="coleccion-primavera"
                />
              </label>
              <label>
                <span>Orden del álbum</span>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={draft.sortOrder}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sortOrder: Math.max(
                        0,
                        Number.parseInt(event.target.value, 10) || 0,
                      ),
                    }))
                  }
                />
              </label>
            </div>
            <label>
              <span>Categoría editorial</span>
              <input
                value={draft.category}
                maxLength={120}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                placeholder="Retrato, producto, evento…"
              />
              <small>
                El álbum mismo será la categoría navegable en público.
              </small>
            </label>
            <label>
              <span>Descripción</span>
              <textarea
                value={draft.description}
                maxLength={2000}
                rows={4}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Contexto breve para presentar la colección."
              />
            </label>
          </div>

          <div className="lmw-galleries-admin__upload">
            <div>
              <strong>Carga real a R2</strong>
              <span>JPG, PNG o WebP · máximo 5 MB</span>
            </div>
            <label className={draft.id && !busy ? '' : 'is-disabled'}>
              Seleccionar imágenes
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={!draft.id || busy}
                onChange={(event) => void uploadImages(event)}
              />
            </label>
          </div>

          <div className="lmw-galleries-admin__images">
            <div className="lmw-galleries-admin__section-heading">
              <div>
                <strong>Orden y portada</strong>
                <span>La primera imagen se usa como portada inicial.</span>
              </div>
              <b>{draft.images.length}</b>
            </div>

            {draft.images.length === 0 ? (
              <div className="lmw-galleries-admin__empty-images">
                <i aria-hidden="true">▧</i>
                <span>Aún no hay imágenes en este álbum.</span>
              </div>
            ) : (
              <ol>
                {draft.images.map((image, index) => (
                  <li
                    key={image.id}
                    className={
                      image.id === draft.coverImageId ? 'is-cover' : ''
                    }
                  >
                    <img src={image.url} alt={image.alt ?? ''} />
                    <div className="lmw-galleries-admin__image-copy">
                      <div>
                        <b>Imagen {index + 1}</b>
                        <span>
                          {image.width}×{image.height}px
                        </span>
                      </div>
                      <input
                        value={image.alt ?? ''}
                        maxLength={240}
                        aria-label={`Texto alternativo de imagen ${index + 1}`}
                        placeholder="Texto alternativo"
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            images: current.images.map((candidate) =>
                              candidate.id === image.id
                                ? {
                                    ...candidate,
                                    alt: event.target.value,
                                  }
                                : candidate,
                            ),
                          }))
                        }
                        onBlur={() => void saveAlt(image)}
                      />
                    </div>
                    <div className="lmw-galleries-admin__image-actions">
                      <button
                        type="button"
                        title="Subir"
                        aria-label={`Subir imagen ${index + 1}`}
                        disabled={index === 0 || busy}
                        onClick={() => void moveImage(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Bajar"
                        aria-label={`Bajar imagen ${index + 1}`}
                        disabled={
                          index === draft.images.length - 1 || busy
                        }
                        onClick={() => void moveImage(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="is-cover-action"
                        disabled={
                          image.id === draft.coverImageId || busy
                        }
                        onClick={() => void chooseCover(image.id)}
                      >
                        {image.id === draft.coverImageId
                          ? 'Portada'
                          : 'Elegir portada'}
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        aria-label={`Eliminar imagen ${index + 1}`}
                        disabled={busy}
                        onClick={() => setImagePendingDeletion(image)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="lmw-galleries-admin__footer-actions">
            <button type="button" className="is-quiet" onClick={preview}>
              Previsualizar
            </button>
            <button
              type="button"
              className="is-secondary"
              onClick={() => void saveDraft()}
              disabled={busy}
            >
              Guardar borrador
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => void publish()}
              disabled={busy}
            >
              {busy ? 'Procesando…' : 'Publicar'}
            </button>
            {draft.publishedRevisionAt ? (
              <button
                type="button"
                className="is-secondary"
                onClick={() => void unpublish()}
                disabled={busy}
              >
                Retirar
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      {imagePendingDeletion ? (
        <div className="lmw-galleries-admin__dialog-backdrop" role="presentation">
          <div
            className="lmw-galleries-admin__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-delete-title"
          >
            <span>ELIMINAR IMAGEN</span>
            <h2 id="gallery-delete-title">
              ¿Eliminar {imagePendingDeletion.alt?.trim() || 'esta imagen'}?
            </h2>
            <p>
              El archivo también se borrará de R2. Esta acción no se puede deshacer.
            </p>
            <div>
              <button
                type="button"
                className="is-quiet"
                onClick={() => setImagePendingDeletion(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={busy}
                onClick={() => {
                  const imageId = imagePendingDeletion.id;
                  setImagePendingDeletion(null);
                  void deleteImage(imageId);
                }}
              >
                Eliminar de R2
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AlbumIndexPreview({
  albums,
}: {
  albums: GalleryAlbumSummary[];
}) {
  const visible = albums;
  return (
    <div className="lmw-gallery-preview">
      <header className="lmw-gallery-preview__intro">
        <span>ARCHIVO VISUAL</span>
        <h2>Galerías</h2>
        <p>
          Colecciones organizadas por álbum para explorar cada historia en su
          propio ritmo.
        </p>
      </header>
      {visible.length === 0 ? (
        <div className="lmw-gallery-preview__empty">
          Publica un álbum para verlo en este listado.
        </div>
      ) : (
        <div className="lmw-gallery-preview__albums">
          {visible.map((album, index) => (
            <article key={album.id}>
              {album.coverImage ? (
                <img
                  src={album.coverImage.url}
                  alt={album.coverImage.alt ?? album.title}
                />
              ) : (
                <div className="lmw-gallery-preview__placeholder" />
              )}
              <div>
                <small>{album.category}</small>
                <h3>{album.title}</h3>
                <span>
                  {String(index + 1).padStart(2, '0')} / {album.imageCount}{' '}
                  imágenes
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumPreview({
  draft,
  cover,
}: {
  draft: AlbumDraft;
  cover: GalleryImageView | null;
}) {
  return (
    <div className="lmw-gallery-preview lmw-gallery-preview--detail">
      <header
        className={cover ? 'has-cover' : ''}
        style={
          cover
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(4, 8, 14, .08), rgba(4, 8, 14, .92)), url("${cover.url}")`,
              }
            : undefined
        }
      >
        <span>{draft.category || 'SIN CATEGORÍA'}</span>
        <h2>{draft.title || 'Título del álbum'}</h2>
        <p>
          {draft.description ||
            'La descripción del álbum aparecerá aquí como introducción pública.'}
        </p>
        <small>{draft.images.length} imágenes</small>
      </header>
      {draft.images.length === 0 ? (
        <div className="lmw-gallery-preview__empty">
          Carga imágenes para construir la vista del álbum.
        </div>
      ) : (
        <div className="lmw-gallery-preview__mosaic">
          {draft.images.map((image, index) => (
            <figure key={image.id} className={index % 5 === 0 ? 'is-wide' : ''}>
              <img src={image.url} alt={image.alt ?? ''} />
              <figcaption>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {image.id === draft.coverImageId ? <b>PORTADA</b> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="lmw-gallery-preview__loading" aria-label="Cargando">
      <i />
      <i />
      <i />
    </div>
  );
}

function toDraft(album: GalleryAlbumDetail): AlbumDraft {
  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    description: album.description ?? '',
    category: album.category,
    sortOrder: album.sortOrder,
    status: album.status,
    publishedRevisionAt: album.publishedRevisionAt,
    hasUnpublishedChanges: album.hasUnpublishedChanges,
    coverImageId: album.coverImageId,
    images: album.images,
  };
}

function statusLabel(
  status: GalleryStatus,
  hasUnpublishedChanges = false,
): string {
  if (status === 'published' && hasUnpublishedChanges) {
    return 'Publicado · cambios sin publicar';
  }
  return status === 'published' ? 'Publicado' : 'Borrador';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
