/**
 * TLDs que ofrecemos en el buscador de dominios propios. Namesilo soporta
 * muchos más, pero limitamos la búsqueda para mantener el costo (incluido en
 * el mantenimiento) predecible.
 */
export const DOMAIN_REGISTRAR_TLDS = ['com', 'mx', 'com.mx', 'net'] as const;
export type DomainRegistrarTld = (typeof DOMAIN_REGISTRAR_TLDS)[number];

export interface DomainAvailability {
  /** Dominio completo, ej. "shynolaser.com". */
  domain: string;
  available: boolean;
  /** Precio de un año de registro en centavos de USD; null si no se pudo determinar. */
  priceCents: number | null;
}

export interface DomainPurchaseResult {
  domain: string;
  /** Identificador de la orden en el registrador, para auditoría/soporte. */
  orderId: string;
}

export interface DomainRegistrarDnsRecord {
  type: 'CNAME' | 'ALIAS' | 'TXT';
  /** Host relativo al dominio raíz; '' o '@' representa el apex. */
  host: string;
  value: string;
  ttlSeconds: number;
}

/**
 * Boundary para un registrador de dominios real (compra + DNS). Es
 * complementario a `DomainProvider` (Cloudflare), que sigue gestionando el
 * Custom Hostname/SSL una vez que el dominio ya existe y apunta a nosotros.
 */
export interface DomainRegistrar {
  readonly name: string;
  checkAvailability(input: {
    sld: string;
    tlds: readonly string[];
  }): Promise<DomainAvailability[]>;
  purchase(input: { domain: string; years: 1 }): Promise<DomainPurchaseResult>;
  setDnsRecords(input: {
    domain: string;
    records: DomainRegistrarDnsRecord[];
  }): Promise<void>;
}
