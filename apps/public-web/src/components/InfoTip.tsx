import { useId, useState } from 'react';

/**
 * Ícono "i" reutilizable que abre un panel informativo con texto explicativo.
 * Se usa para aclarar decisiones opcionales (mantenimiento, dominio propio, etc.)
 * sin saturar la interfaz principal.
 */
export function InfoTip({ label = 'Más información', title, children }: {
  label?: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <span className="lmw-info-tip">
      <button
        type="button"
        className="lmw-info-tip__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      {open ? (
        <div id={panelId} className="lmw-info-tip__panel" role="dialog" aria-label={title}>
          <div className="lmw-info-tip__panel-header">
            <strong>{title}</strong>
            <button
              type="button"
              className="lmw-info-tip__close"
              aria-label="Cerrar información"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="lmw-info-tip__panel-body">{children}</div>
        </div>
      ) : null}
    </span>
  );
}
