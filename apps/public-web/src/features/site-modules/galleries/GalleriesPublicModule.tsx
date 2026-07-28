import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';
import './galleriesPublicModule.css';

export interface GalleriesPublicModuleProps {
  projectId: string;
  apiBaseUrl?: string;
}

interface GalleryImage {
  id: string;
  alt: string | null;
  position: number;
  width: number;
  height: number;
  createdAt: string;
  url: string;
}

interface GalleryAlbumBase {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: 'published';
  coverImageId: string | null;
  sortOrder: number;
  publishedAt: string | null;
}

interface GalleryAlbumSummary extends GalleryAlbumBase {
  imageCount: number;
  coverImage: GalleryImage | null;
}

interface GalleryAlbumDetail extends GalleryAlbumBase {
  images: GalleryImage[];
  coverImage: GalleryImage | null;
}

interface GalleryListResponse {
  projectId: string;
  albums: GalleryAlbumSummary[];
}

export function GalleriesPublicModule({
  projectId,
  apiBaseUrl,
}: GalleriesPublicModuleProps) {
  const endpoint = useMemo(() => {
    const base =
      apiBaseUrl ??
      import.meta.env.VITE_PUBLIC_API_URL ??
      'http://127.0.0.1:8887';
    return `${base.replace(/\/$/, '')}/sites/${encodeURIComponent(
      projectId,
    )}/galleries`;
  }, [apiBaseUrl, projectId]);
  const routeBase = `/sites/${encodeURIComponent(projectId)}/galleries`;
  const [slug, setSlug] = useState(() => slugFromLocation(routeBase));
  const [albums, setAlbums] = useState<GalleryAlbumSummary[]>([]);
  const [album, setAlbum] = useState<GalleryAlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);

  useEffect(() => {
    const onPopState = () => setSlug(slugFromLocation(routeBase));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [routeBase]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!slug) {
      void getJson<GalleryListResponse>(endpoint)
        .then((response) => {
          if (!active) return;
          setAlbums(response.albums);
          setAlbum(null);
        })
        .catch((caught) => {
          if (active) setError(errorMessage(caught));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      void getJson<GalleryAlbumDetail>(
        `${endpoint}/${encodeURIComponent(slug)}`,
      )
        .then((response) => {
          if (!active) return;
          setAlbum(response);
        })
        .catch((caught) => {
          if (active) setError(errorMessage(caught));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [endpoint, slug]);

  useEffect(() => {
    if (!lightbox) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [lightbox]);

  function navigate(nextSlug: string | null) {
    const path = nextSlug
      ? `${routeBase}/${encodeURIComponent(nextSlug)}`
      : routeBase;
    window.history.pushState({}, '', path);
    setSlug(nextSlug);
    setLightbox(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <section className="lmw-galleries-public">
      <div className="lmw-galleries-public__grain" aria-hidden="true" />
      {loading ? (
        <GalleryLoading />
      ) : error ? (
        <div className="lmw-galleries-public__state" role="alert">
          <span>ARCHIVO NO DISPONIBLE</span>
          <h2>No pudimos abrir esta galería.</h2>
          <p>{error}</p>
          {slug ? (
            <button type="button" onClick={() => navigate(null)}>
              Volver a galerías
            </button>
          ) : null}
        </div>
      ) : slug && album ? (
        <AlbumView
          album={album}
          onBack={() => navigate(null)}
          onOpenImage={setLightbox}
        />
      ) : (
        <AlbumList albums={albums} onOpen={(next) => navigate(next)} />
      )}

      {lightbox ? (
        <div
          className="lmw-galleries-public__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt ?? 'Imagen ampliada'}
          onClick={() => setLightbox(null)}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setLightbox(null);
            }
          }}
          tabIndex={0}
        >
          <button type="button" onClick={() => setLightbox(null)}>
            Cerrar ×
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.alt ?? ''}
            width={lightbox.width}
            height={lightbox.height}
          />
        </div>
      ) : null}
    </section>
  );
}

function AlbumList({
  albums,
  onOpen,
}: {
  albums: GalleryAlbumSummary[];
  onOpen: (slug: string) => void;
}) {
  return (
    <div className="lmw-galleries-public__shell">
      <header className="lmw-galleries-public__masthead">
        <span>LMWARES / ARCHIVO VISUAL</span>
        <div>
          <h1>Galerías</h1>
          <p>
            Cada álbum es una colección independiente: una categoría visual
            para explorar imágenes, atmósferas y detalles.
          </p>
        </div>
        <b>{String(albums.length).padStart(2, '0')} ÁLBUMES</b>
      </header>

      {albums.length === 0 ? (
        <div className="lmw-galleries-public__state">
          <span>ARCHIVO EN PREPARACIÓN</span>
          <h2>Pronto habrá nuevas colecciones.</h2>
        </div>
      ) : (
        <div className="lmw-galleries-public__album-grid">
          {albums.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={index % 5 === 0 ? 'is-featured' : ''}
              onClick={() => onOpen(item.slug)}
            >
              <div className="lmw-galleries-public__album-media">
                {item.coverImage ? (
                  <img
                    src={item.coverImage.url}
                    alt={item.coverImage.alt ?? item.title}
                    width={item.coverImage.width}
                    height={item.coverImage.height}
                    loading={index > 2 ? 'lazy' : 'eager'}
                    decoding="async"
                  />
                ) : (
                  <i aria-hidden="true" />
                )}
                <span>{String(index + 1).padStart(2, '0')}</span>
              </div>
              <div className="lmw-galleries-public__album-copy">
                <small>{item.category}</small>
                <h2>{item.title}</h2>
                <p>{item.description ?? 'Explorar esta colección visual.'}</p>
                <b>
                  Ver álbum <i aria-hidden="true">↗</i>
                </b>
                <em>{item.imageCount} imágenes</em>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumView({
  album,
  onBack,
  onOpenImage,
}: {
  album: GalleryAlbumDetail;
  onBack: () => void;
  onOpenImage: (image: GalleryImage) => void;
}) {
  const cover = album.coverImage ?? album.images[0] ?? null;
  return (
    <article className="lmw-galleries-public__detail">
      <header
        className={cover ? 'has-cover' : ''}
        style={
          cover
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(5, 9, 7, .18), rgba(5, 9, 7, .9)), url("${cover.url}")`,
              }
            : undefined
        }
      >
        <button type="button" onClick={onBack}>
          ← Todas las galerías
        </button>
        <div>
          <span>{album.category}</span>
          <h1>{album.title}</h1>
          {album.description ? <p>{album.description}</p> : null}
          <small>{album.images.length} IMÁGENES</small>
        </div>
      </header>

      <div className="lmw-galleries-public__image-grid">
        {album.images.map((image, index) => (
          <button
            type="button"
            key={image.id}
            className={index % 7 === 0 ? 'is-wide' : ''}
            onClick={() => onOpenImage(image)}
            aria-label={`Abrir imagen ${index + 1}${
              image.alt ? `: ${image.alt}` : ''
            }`}
          >
            <img
              src={image.url}
              alt={image.alt ?? ''}
              width={image.width}
              height={image.height}
              loading={index > 3 ? 'lazy' : 'eager'}
              decoding="async"
            />
            <span>{String(index + 1).padStart(2, '0')}</span>
          </button>
        ))}
      </div>

      <footer>
        <span>FIN DEL ÁLBUM</span>
        <button type="button" onClick={onBack}>
          Explorar otras galerías →
        </button>
      </footer>
    </article>
  );
}

function GalleryLoading() {
  return (
    <div
      className="lmw-galleries-public__loading"
      aria-label="Cargando galerías"
    >
      <header>
        <i />
        <i />
      </header>
      <div>
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    const message = readApiError(payload);
    throw new Error(message ?? `Error HTTP ${response.status}`);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return null;
  }
  const error = payload.error;
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return null;
  }
  return typeof error.message === 'string' ? error.message : null;
}

function slugFromLocation(routeBase: string): string | null {
  const normalizedBase = routeBase.replace(/\/$/, '');
  const path = window.location.pathname.replace(/\/$/, '');
  if (!path.startsWith(`${normalizedBase}/`)) return null;
  const candidate = path.slice(normalizedBase.length + 1).split('/')[0];
  return candidate ? decodeURIComponent(candidate) : null;
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error && caught.message
    ? caught.message
    : 'Intenta de nuevo más tarde.';
}
