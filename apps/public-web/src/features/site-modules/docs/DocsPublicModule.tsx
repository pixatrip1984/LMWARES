import { useEffect, useMemo, useState } from 'react';
import type {
  SiteDocPublicItem,
  SiteDocsPublicLibrary,
} from '@starter/domain';
import './docsPublicModule.css';

export interface DocsPublicModuleProps {
  projectId: string;
  apiBaseUrl?: string;
}

export function DocsPublicModule({ projectId, apiBaseUrl }: DocsPublicModuleProps) {
  const [library, setLibrary] = useState<SiteDocsPublicLibrary | null>(null);
  const [categoryId, setCategoryId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const base = (
    apiBaseUrl ??
    import.meta.env.VITE_PUBLIC_API_URL ??
    'http://127.0.0.1:8887'
  ).replace(/\/$/, '');

  useEffect(() => {
    const controller = new AbortController();
    setLibrary(null);
    setError(null);
    fetch(`${base}/sites/${encodeURIComponent(projectId)}/documents`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as SiteDocsPublicLibrary;
      })
      .then(setLibrary)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError('La biblioteca no está disponible por el momento.');
        }
      });
    return () => controller.abort();
  }, [base, projectId]);

  const documents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-MX');
    return (library?.documents ?? []).filter(
      (document) =>
        (categoryId === 'all' || document.categoryId === categoryId) &&
        (!normalized ||
          document.title.toLocaleLowerCase('es-MX').includes(normalized) ||
          document.description?.toLocaleLowerCase('es-MX').includes(normalized) ||
          document.originalName.toLocaleLowerCase('es-MX').includes(normalized)),
    );
  }, [categoryId, library, query]);

  return (
    <main className="lmw-docs-public">
      <header className="lmw-docs-public__topbar">
        <a className="lmw-docs-public__brand" href="/" aria-label="LMWares">
          <span>LM</span>
          <strong>LMWares</strong>
          <small>Docs</small>
        </a>
        <span className="lmw-docs-public__secure">Descarga segura · R2 privado</span>
      </header>

      <section className="lmw-docs-public__hero">
        <small>Biblioteca digital</small>
        <h1>
          Archivos listos
          <br />
          para descargar.
        </h1>
        <p>
          Documentos publicados y versionados por el equipo. Ningún archivo Office se renderiza
          dentro del navegador.
        </p>
        <div className="lmw-docs-public__search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar archivos…"
            aria-label="Buscar archivos"
          />
        </div>
      </section>

      <nav className="lmw-docs-public__filters" aria-label="Categorías">
        <button
          type="button"
          className={categoryId === 'all' ? 'is-active' : ''}
          onClick={() => setCategoryId('all')}
        >
          Todos <span>{library?.documents.length ?? 0}</span>
        </button>
        {(library?.categories ?? []).map((category) => (
          <button
            type="button"
            key={category.id}
            className={categoryId === category.id ? 'is-active' : ''}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <section className="lmw-docs-public__content" aria-live="polite">
        {!library && !error ? (
          <Empty title="Cargando biblioteca…" />
        ) : error ? (
          <Empty title={error} />
        ) : documents.length === 0 ? (
          <Empty
            title={
              query || categoryId !== 'all'
                ? 'No hay coincidencias.'
                : 'Aún no hay archivos publicados.'
            }
          />
        ) : (
          <div className="lmw-docs-public__grid">
            {documents.map((document) => (
              <DocumentCard document={document} key={document.id} />
            ))}
          </div>
        )}
      </section>

      <footer className="lmw-docs-public__footer">
        <span>LMWares DOCS</span>
        <small>{library?.documents.length ?? 0} archivos publicados</small>
      </footer>
    </main>
  );
}

function DocumentCard({ document }: { document: SiteDocPublicItem }) {
  return (
    <article className="lmw-public-doc">
      <div
        className={
          document.previewUrl ? 'lmw-public-doc__preview has-image' : 'lmw-public-doc__preview'
        }
      >
        {document.previewUrl ? (
          <img src={document.previewUrl} alt="" loading="lazy" />
        ) : (
          <span>{document.extension.toUpperCase()}</span>
        )}
        <b>v{document.version}</b>
      </div>
      <div className="lmw-public-doc__body">
        <small>
          {document.categoryName ?? 'General'} · {formatBytes(document.sizeBytes)}
        </small>
        <h2>{document.title}</h2>
        {document.description ? (
          <p>{document.description}</p>
        ) : (
          <p>Archivo verificado y disponible para descarga.</p>
        )}
        <a href={document.downloadUrl} download={document.originalName}>
          <span>Descargar archivo</span>
          <b>↓</b>
        </a>
      </div>
    </article>
  );
}

function Empty({ title }: { title: string }) {
  return (
    <div className="lmw-docs-public__empty">
      <span>DOCS</span>
      <strong>{title}</strong>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
