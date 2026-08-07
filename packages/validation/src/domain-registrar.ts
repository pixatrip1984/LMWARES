import { z } from 'zod';
import type { DomainRegistrarTld } from '@starter/domain';

const SLD_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Debe mantenerse en sync con `DOMAIN_REGISTRAR_TLDS` en
 * `packages/domain/src/models/domain-registrar.ts` (fuente de verdad). Se
 * duplica como literal (en vez de importarlo como valor) porque ese paquete
 * exporta imports de valor cruzados sin extensión, que Node no puede resolver
 * en ejecución real de este archivo bajo `--experimental-strip-types`; un
 * import `type` sí es seguro porque se elide por completo.
 */
const DOMAIN_REGISTRAR_TLDS = ['com', 'mx', 'com.mx', 'net'] as const satisfies readonly DomainRegistrarTld[];

/** Segundo nivel de dominio propuesto por el cliente, ej. "shynolaser". */
export function normalizeDomainSld(value: string): string {
  const sld = value.trim().toLowerCase();
  if (
    !sld ||
    sld.length > 63 ||
    sld.includes('.') ||
    !SLD_LABEL.test(sld) ||
    /^[0-9-]+$/.test(sld)
  ) {
    throw new Error('Escribe sólo el nombre, sin extensión ni puntos (ej. "shynolaser").');
  }
  return sld;
}

export const domainSldSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return normalizeDomainSld(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'El nombre no es válido.',
      });
      return z.NEVER;
    }
  });

export const domainSearchSchema = z.object({
  sld: domainSldSchema,
});

export type DomainSearchInput = z.infer<typeof domainSearchSchema>;

/**
 * Dominio raíz completo elegido de los resultados de búsqueda, ej.
 * "shynolaser.com". Sólo se admite compra a nivel apex (sin subdominio);
 * los TLDs permitidos son los mismos que ofrece `checkAvailability`.
 */
export function normalizeRegistrableDomain(value: string): { domain: string; sld: string; tld: string } {
  const domain = value.trim().toLowerCase();
  if (!domain || domain.length > 253) {
    throw new Error('El dominio no es válido.');
  }
  const tld = [...DOMAIN_REGISTRAR_TLDS]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
  if (!tld) {
    throw new Error('Esa extensión de dominio no está disponible para comprar aquí.');
  }
  const sldPart = domain.slice(0, domain.length - tld.length - 1);
  if (!sldPart || sldPart.includes('.') || !SLD_LABEL.test(sldPart) || /^[0-9-]+$/.test(sldPart)) {
    throw new Error('Sólo se puede comprar el dominio raíz, sin subdominios.');
  }
  return { domain: `${sldPart}.${tld}`, sld: sldPart, tld };
}

export const domainPurchaseSchema = z
  .object({
    domain: z.string().trim(),
  })
  .transform((value, ctx) => {
    try {
      return normalizeRegistrableDomain(value.domain);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['domain'],
        message: error instanceof Error ? error.message : 'El dominio no es válido.',
      });
      return z.NEVER;
    }
  });

export type DomainPurchaseInput = z.infer<typeof domainPurchaseSchema>;
