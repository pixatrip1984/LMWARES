import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  docsApi,
  type SiteDocDraft,
  type SiteDocsAdminLibrary,
  type SiteDocVersion,
  type SiteDocWithCurrentVersion,
} from './docsApi';
import './docsWorkspace.css';

export interface DocsWorkspaceProps {
  projectId: string;
}

const EMPTY_DRAFT: SiteDocDraft = {
  title: '',
  description: null,
  categoryId: null,
  accessLevel: 'private',
  downloadEnabled: true,
  sortOrder: 0,
  metadata: {},
};

const ACCEPT =
  '.pdf,.jpg,.png,.webp,.docx,.xlsx,.pptx,.csv,.txt,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,text/plain';

export function DocsWorkspace({ projectId }: DocsWorkspaceProps) {
  const [library, setLibrary] = useState<SiteDocsAdminLibrary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SiteDocDraft>(EMPTY_DRAFT);
  const [versions, setVersions] = useState<SiteDocVersion[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const next = await docsApi.list(projectId);
    setLibrary(next);
    setSelectedId((current) =>
      current && next.documents.some((document) => document.id === current)
        ? current
        : (next.documents[0]?.id ?? null),
    );
  }, [projectId]);

  useEffect(() => {
    setMessage(null);
    void load().catch((error: unknown) => setMessage(errorText(error, 'No se pudo cargar DOCS.')));
  }, [load]);

  const selected = library?.documents.find((document) => document.id === selectedId) ?? null;
  const publicDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-MX');
    return (library?.publishedDocuments ?? []).filter(
      (document) =>
        document.status === 'published' &&
        document.accessLevel === 'public' &&
        document.downloadEnabled &&
        (!normalized ||
          document.title.toLocaleLowerCase('es-MX').includes(normalized) ||
          document.category?.name.toLocaleLowerCase('es-MX').includes(normalized)),
    );
  }, [library, query]);

  useEffect(() => {
    if (!selected) {
      setDraft(EMPTY_DRAFT);
      setVersions([]);
      return;
    }
    setDraft({
      title: selected.title,
      description: selected.description,
      categoryId: selected.categoryId,
      accessLevel: selected.accessLevel,
      downloadEnabled: selected.downloadEnabled,
      sortOrder: selected.sortOrder,
      metadata: selected.metadata,
    });
    void docsApi
      .listVersions(projectId, selected.id)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [projectId, selected]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(success);
    } catch (error) {
      setMessage(errorText(error, 'La operación no pudo completarse.'));
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setVersions([]);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function upload() {
    if (!file) {
      setMessage('Selecciona un archivo permitido.');
      return;
    }
    if (!selected && !draft.title.trim()) {
      setMessage('Escribe el título público del archivo.');
      return;
    }
    await run(
      async () => {
        const document = selected
          ? await docsApi.addVersion(projectId, selected.id, file)
          : await docsApi.createDocument(projectId, { ...draft, title: draft.title.trim(), file });
        setSelectedId(document.id);
        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      },
      selected
        ? selected.publishedRevisionAt
          ? 'Nueva versión validada. La versión pública anterior sigue activa.'
          : 'Nueva versión validada; publícala cuando esté lista.'
        : 'Archivo validado y guardado como clean.',
    );
  }

  async function save() {
    if (!selected) return;
    await run(async () => {
      await docsApi.updateDocument(projectId, selected.id, draft);
    },
    selected.publishedRevisionAt
      ? 'Borrador guardado. La versión pública anterior sigue activa.'
      : 'Metadatos y permisos guardados.');
  }

  async function publish() {
    if (!selected) return;
    await run(async () => {
      await docsApi.publish(projectId, selected.id);
    }, 'Documento publicado en la biblioteca.');
  }

  async function unpublish() {
    if (!selected) return;
    await run(async () => {
      await docsApi.unpublish(projectId, selected.id);
    }, 'Documento retirado de la biblioteca pública.');
  }

  async function createCategory() {
    const name = categoryName.trim();
    if (!name) return;
    await run(async () => {
      await docsApi.createCategory(projectId, {
        name,
        slug: slugify(name),
        sortOrder: library?.categories.length ?? 0,
      });
      setCategoryName('');
    }, 'Categoría creada.');
  }

  function preview() {
    const configuredBase = import.meta.env.VITE_PUBLIC_WEB_URL?.trim();
    const isLoopback =
      window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    const base = configuredBase || (isLoopback ? 'http://127.0.0.1:5273' : '');
    if (!base) {
      setMessage('Falta configurar VITE_PUBLIC_WEB_URL para abrir la vista pública.');
      return;
    }
    window.open(
      `${base.replace(/\/$/, '')}/sites/${encodeURIComponent(projectId)}/docs`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <section className="lmw-docs-admin">
      <header className="lmw-docs-admin__header">
        <div className="lmw-docs-admin__brand">
          <span className="lmw-docs-admin__mark">LM</span>
          <span>
            <strong>LMWares</strong>
            <small>DOCS / {projectId}</small>
          </span>
        </div>
        <div className="lmw-docs-admin__actions">
          <button type="button" className="is-ghost" onClick={preview}>
            Previsualizar
          </button>
          <button
            type="button"
            className="is-ghost"
            disabled={!selected || busy}
            onClick={() => void save()}
          >
            Guardar
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={!selected || busy}
            onClick={() => void publish()}
          >
            Publicar
          </button>
        </div>
      </header>

      {message ? (
        <div className="lmw-docs-admin__notice" role="status">
          {message}
        </div>
      ) : null}

      <div className="lmw-docs-admin__split">
        <div className="lmw-docs-admin__library">
          <div className="lmw-docs-admin__section-head">
            <div>
              <small>Vista pública</small>
              <h1>Biblioteca de archivos</h1>
            </div>
            <span>{publicDocuments.length} publicados</span>
          </div>
          <input
            className="lmw-docs-admin__search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en la biblioteca…"
          />
          <div className="lmw-docs-admin__cards">
            {publicDocuments.length ? (
              publicDocuments.map((document) => (
                <button
                  type="button"
                  className={selectedId === document.id ? 'lmw-doc-card is-active' : 'lmw-doc-card'}
                  key={document.id}
                  onClick={() => setSelectedId(document.id)}
                >
                  <FileGlyph extension={document.currentVersion?.extension ?? null} />
                  <span>
                    <strong>{document.title}</strong>
                    <small>
                      {document.category?.name ?? 'General'} · v
                      {document.currentVersion?.version ?? '—'}
                    </small>
                  </span>
                  <b>↓</b>
                </button>
              ))
            ) : (
              <div className="lmw-docs-admin__empty">
                <strong>La biblioteca pública está vacía</strong>
                <span>Sube, valida y publica el primer archivo.</span>
              </div>
            )}
          </div>
        </div>

        <aside className="lmw-docs-admin__editor">
          <div className="lmw-docs-admin__editor-top">
            <label>
              Documento
              <select
                value={selectedId ?? ''}
                onChange={(event) =>
                  event.target.value ? setSelectedId(event.target.value) : startNew()
                }
              >
                <option value="">Nuevo documento</option>
                {(library?.documents ?? []).map((document) => (
                  <option value={document.id} key={document.id}>
                    {document.title} · {documentStatusLabel(document)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="is-compact" onClick={startNew}>
              + Nuevo
            </button>
          </div>

          <div className="lmw-docs-admin__status">
            <span className={`is-${selected?.status ?? 'uploading'}`}>
              {selected ? documentStatusLabel(selected) : statusLabel('uploading')}
            </span>
            <small>AV profundo fuera del Worker/MVP</small>
          </div>

          <div className="lmw-docs-admin__form">
            <label>
              Título
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              Descripción
              <textarea
                rows={3}
                value={draft.description ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value || null })
                }
              />
            </label>
            <div className="lmw-docs-admin__form-grid">
              <label>
                Categoría
                <select
                  value={draft.categoryId ?? ''}
                  onChange={(event) =>
                    setDraft({ ...draft, categoryId: event.target.value || null })
                  }
                >
                  <option value="">General</option>
                  {(library?.categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Permiso
                <select
                  value={draft.accessLevel}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      accessLevel: event.target.value === 'public' ? 'public' : 'private',
                    })
                  }
                >
                  <option value="private">Privado</option>
                  <option value="public">Público</option>
                </select>
              </label>
            </div>
            <label className="lmw-docs-admin__check">
              <input
                type="checkbox"
                checked={draft.downloadEnabled}
                onChange={(event) => setDraft({ ...draft, downloadEnabled: event.target.checked })}
              />
              Permitir descarga pública
            </label>
          </div>

          <div className="lmw-docs-admin__upload">
            <small>{selected ? 'Nueva versión' : 'Carga inicial'}</small>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p>PDF, JPG, PNG, WebP, DOCX, XLSX, PPTX, CSV o TXT. Máx. 25 MB; texto 5 MB.</p>
            <button type="button" disabled={!file || busy} onClick={() => void upload()}>
              {busy ? 'Procesando…' : selected ? 'Subir nueva versión' : 'Crear documento'}
            </button>
          </div>

          <div className="lmw-docs-admin__categories">
            <small>Categorías</small>
            <div>
              <input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Nueva categoría"
              />
              <button
                type="button"
                disabled={!categoryName.trim() || busy}
                onClick={() => void createCategory()}
              >
                Agregar
              </button>
            </div>
          </div>

          {selected ? (
            <div className="lmw-docs-admin__versions">
              <div>
                <small>Versiones</small>
                {selected.status === 'published' ? (
                  <button type="button" onClick={() => void unpublish()} disabled={busy}>
                    Retirar
                  </button>
                ) : null}
              </div>
              {versions.map((version) => (
                <article key={version.id}>
                  <span>v{version.version}</span>
                  <div>
                    <strong>{version.originalName}</strong>
                    <small>
                      {formatBytes(version.sizeBytes)} · {statusLabel(version.status)}
                    </small>
                  </div>
                  {version.rejectionReason ? <p>{version.rejectionReason}</p> : null}
                </article>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function FileGlyph({ extension }: { extension: string | null }) {
  return (
    <span className="lmw-doc-card__glyph">{(extension ?? 'FILE').slice(0, 4).toUpperCase()}</span>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    uploading: 'Cargando',
    quarantine: 'Cuarentena',
    scanning: 'Validando',
    clean: 'Clean',
    rejected: 'Rechazado',
    published: 'Publicado',
  };
  return labels[status] ?? status;
}

function documentStatusLabel(document: SiteDocWithCurrentVersion): string {
  if (document.publishedRevisionAt && document.hasUnpublishedChanges) {
    return 'Publicado · cambios sin publicar';
  }
  if (document.publishedRevisionAt && document.status !== 'published') {
    return 'Publicado · borrador activo';
  }
  return statusLabel(document.status);
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
