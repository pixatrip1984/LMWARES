import clsx, { type ClassValue } from 'clsx';

/** Une clases de Tailwind de forma condicional. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
