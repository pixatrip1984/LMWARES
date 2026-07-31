import { useEffect, useRef, useState } from 'react';
import './packagePreview.css';
import './freePublicationModal.css';

export type FreePublicationStatus =
  | 'idle'
  | 'checking'
  | 'uploading'
  | 'queued'
  | 'published'
  | 'failed';

type FreePublicationModalProps = {
  message?: string;
  onClose: () => void;
  open: boolean;
  publicUrl?: string | null;
  slug?: string;
  status: FreePublicationStatus;
};

const PHASES: Array<{
  id: Exclude<FreePublicationStatus, 'idle' | 'failed'>;
  label: string;
}> = [
  { id: 'checking', label: 'Preparando solicitud' },
  { id: 'uploading', label: 'Protegiendo imágenes' },
  { id: 'queued', label: 'Generando y publicando' },
  { id: 'published', label: 'Sitio en línea' },
];

const STATUS_ORDER: Record<FreePublicationStatus, number> = {
  idle: 0,
  checking: 1,
  uploading: 2,
  queued: 3,
  published: 4,
  failed: -1,
};

export function FreePublicationModal({
  message,
  onClose,
  open,
  publicUrl,
  slug,
  status,
}: FreePublicationModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const siteUrl = publicUrl ?? (slug ? `https://${slug}.lmwares.com` : '');
  const published = status === 'published' && Boolean(publicUrl);
  const failed = status === 'failed';

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 50);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  useEffect(() => {
    setCopyState('idle');
  }, [siteUrl]);

  if (!open) return null;

  const copyUrl = async () => {
    if (!siteUrl) return;
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="lmw-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Estado de publicación del sitio Free"
        aria-modal="true"
        className="lmw-preview-dialog lmw-publication-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="lmw-preview-shellbar">
          <div className="lmw-preview-brand"><i />LMWARES</div>
          <div
            aria-live="polite"
            className={`lmw-publication-state is-${status}`}
            role="status"
          >
            <i />
            {published ? 'Publicado' : failed ? 'Requiere atención' : 'Generación en curso'}
          </div>
          <button
            aria-label="Cerrar estado de publicación"
            className="lmw-preview-close"
            onClick={onClose}
            type="button"
          >
            Cerrar
          </button>
        </header>

        <div className={`lmw-preview-canvas lmw-publication-canvas is-${status}`}>
          {published && publicUrl ? (
            <>
              <iframe
                className="lmw-publication-frame"
                src={publicUrl}
                title={`Sitio publicado: ${slug ?? 'página Free'}`}
              />
              <section className="lmw-publication-ready" aria-labelledby="publication-ready-title">
                <div>
                  <span>PUBLICACIÓN COMPLETADA</span>
                  <h2 id="publication-ready-title">Tu página ya está en línea.</h2>
                  <p>Ésta es la entrega real, no el sitio demostrativo.</p>
                </div>
                <div className="lmw-publication-url">
                  <label htmlFor="lmw-publication-url">URL pública</label>
                  <div>
                    <input id="lmw-publication-url" readOnly value={publicUrl} />
                    <button onClick={copyUrl} type="button">
                      {copyState === 'copied'
                        ? 'Copiada ✓'
                        : copyState === 'failed'
                          ? 'No se pudo copiar'
                          : 'Copiar'}
                    </button>
                    <a href={publicUrl} rel="noreferrer" target="_blank">
                      Abrir sitio ↗
                    </a>
                  </div>
                </div>
              </section>
            </>
          ) : failed ? (
            <section className="lmw-publication-progress is-failed">
              <span>PUBLICACIÓN DETENIDA</span>
              <h2>No pudimos terminar esta página.</h2>
              <p>{message ?? 'La solicitud necesita revisión antes de volver a intentarlo.'}</p>
              <button onClick={onClose} type="button">Volver al configurador</button>
            </section>
          ) : (
            <section className="lmw-publication-progress">
              <div className="lmw-publication-progress__signal" aria-hidden="true">
                <i />
                <span />
              </div>
              <span>SITIO REAL · FREE</span>
              <h2>Estamos preparando tu página.</h2>
              <p>
                {message ??
                  'Puedes dejar esta ventana abierta. Cambiará automáticamente cuando la publicación esté lista.'}
              </p>
              <div className="lmw-publication-progress__bar" aria-hidden="true">
                <i style={{ width: `${Math.max(8, STATUS_ORDER[status] * 24)}%` }} />
              </div>
              <ol>
                {PHASES.map((phase) => {
                  const phaseOrder = STATUS_ORDER[phase.id];
                  const currentOrder = STATUS_ORDER[status];
                  const phaseState =
                    phaseOrder < currentOrder
                      ? 'is-complete'
                      : phaseOrder === currentOrder
                        ? 'is-active'
                        : '';
                  return (
                    <li className={phaseState} key={phase.id}>
                      <i>{phaseOrder < currentOrder ? '✓' : phaseOrder}</i>
                      <span>{phase.label}</span>
                    </li>
                  );
                })}
              </ol>
              {siteUrl ? <small>Destino reservado: {siteUrl}</small> : null}
            </section>
          )}
        </div>

        <footer className="lmw-preview-footer lmw-publication-footer">
          <button onClick={onClose} type="button">
            {published || failed ? 'Volver al configurador' : 'Seguir en segundo plano'}
          </button>
          <div className="lmw-preview-footer__meta">
            <div>
              <span>{published ? 'Entrega real' : 'Procesamiento'}</span>
              <strong>FREE</strong>
            </div>
            <p>
              {published
                ? 'El visor carga la página publicada en el subdominio definitivo de LMWares.'
                : 'Esta vista se actualizará automáticamente; no necesitas recargar ni abrir el subdominio antes de tiempo.'}
            </p>
          </div>
          {published && publicUrl ? (
            <a className="lmw-publication-footer__open" href={publicUrl} rel="noreferrer" target="_blank">
              Navegar al sitio ↗
            </a>
          ) : (
            <button disabled type="button">Publicando…</button>
          )}
        </footer>
      </section>
    </div>
  );
}
