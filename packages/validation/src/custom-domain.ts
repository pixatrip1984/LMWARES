import { z } from 'zod';
import { CUSTOM_DOMAIN_TYPES } from '@starter/domain';

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Only delegated subdomains are supported in the first release. Apex domains
 * require provider-specific DNS and certificate handling and remain explicit
 * future work.
 */
export function normalizeCustomDomainHostname(value: string): string {
  const hostname = value.trim().toLowerCase();
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes('/') ||
    hostname.includes('?') ||
    hostname.includes('#') ||
    hostname.includes('@') ||
    hostname.includes(':') ||
    hostname.includes('*') ||
    hostname.endsWith('.')
  ) {
    throw new Error('El dominio debe ser un hostname sin rutas, puertos ni comodines.');
  }

  const labels = hostname.split('.');
  if (
    labels.length < 3 ||
    !CUSTOM_DOMAIN_TYPES.includes(labels[0] as (typeof CUSTOM_DOMAIN_TYPES)[number]) ||
    labels.some((label) => label.length < 1 || label.length > 63 || !HOSTNAME_LABEL.test(label)) ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'lmwares.com' ||
    hostname.endsWith('.lmwares.com') ||
    /^[0-9.]+$/.test(hostname)
  ) {
    throw new Error('Usa un subdominio válido como www.tuempresa.com o app.tuempresa.com.');
  }
  return hostname;
}

export const customDomainHostnameSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return normalizeCustomDomainHostname(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'El hostname no es válido.',
      });
      return z.NEVER;
    }
  });

export const createCustomDomainSchema = z.object({
  hostname: customDomainHostnameSchema,
  type: z.enum(CUSTOM_DOMAIN_TYPES),
}).superRefine((value, ctx) => {
  if (!value.hostname.startsWith(`${value.type}.`)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hostname'],
      message: `El hostname debe comenzar con "${value.type}." para coincidir con el tipo seleccionado.`,
    });
  }
});

export type CreateCustomDomainInput = z.infer<typeof createCustomDomainSchema>;

export const verifyCustomDomainSchema = z.object({
  token: z.string().trim().min(16).max(128),
});

export type VerifyCustomDomainInput = z.infer<typeof verifyCustomDomainSchema>;
