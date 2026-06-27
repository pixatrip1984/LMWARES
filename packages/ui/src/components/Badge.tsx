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
};

/** Badge que colorea automáticamente según el estado de dominio. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{status}</Badge>;
}
