import type { ReactNode } from 'react';
import { cn } from '../cn';

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red';

const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-brand-100 text-brand-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone])}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  // publicaciones
  draft: 'gray',
  published: 'green',
  archived: 'amber',
  // solicitudes
  new: 'blue',
  in_review: 'amber',
  approved: 'green',
  rejected: 'red',
  closed: 'gray',
  // commercial intakes
  submitted: 'blue',
  scope_review: 'amber',
  offer_ready: 'blue',
  declined: 'red',
  converted: 'green',
};

const STATUS_LABELS: Record<string, string> = {
  // publicaciones
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
  // solicitudes
  new: 'Nueva',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  closed: 'Cerrada',
  // commercial intakes
  submitted: 'Recibida',
  scope_review: 'En revisión',
  offer_ready: 'Propuesta lista',
  declined: 'No aprobada',
  converted: 'Convertida',
};

/** Badge que colorea automáticamente según el estado de dominio. */
export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{label}</Badge>;
}
