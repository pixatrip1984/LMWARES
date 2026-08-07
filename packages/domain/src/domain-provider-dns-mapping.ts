/**
 * Traduce las `DomainProviderDnsInstruction[]` que devuelve `DomainProvider`
 * (Cloudflare) a los `DomainRegistrarDnsRecord[]` que necesita un
 * `DomainRegistrar` (Namesilo) para publicarlos automáticamente.
 *
 * Módulo puro (sin imports cruzados) para poder testearlo con ejecución real
 * de Node, siguiendo el mismo patrón que `namesilo-response-parsing.ts`.
 */

export type DnsInstructionType = 'CNAME' | 'ALIAS' | 'TXT';

export interface DnsInstructionLike {
  type: DnsInstructionType;
  name: string;
  value: string;
  ttlSeconds: number | null;
}

export interface RegistrarDnsRecordLike {
  type: DnsInstructionType;
  host: string;
  value: string;
  ttlSeconds: number;
}

const MIN_TTL_SECONDS = 3600;

/**
 * `domain` es el dominio raíz comprado (ej. "shynolaser.com"). Cada
 * instrucción se convierte relativa a esa raíz: el propio dominio se vuelve
 * host '' (apex); un subdominio como "_lmwares-verify.shynolaser.com" se
 * vuelve host "_lmwares-verify". Un CNAME que apunte exactamente al apex se
 * reescribe como ALIAS, porque CNAME no es válido en la raíz de una zona.
 */
export function toRegistrarDnsRecords(
  domain: string,
  instructions: readonly DnsInstructionLike[],
): RegistrarDnsRecordLike[] {
  const root = domain.trim().toLowerCase();
  return instructions
    .filter((instruction) => {
      const name = instruction.name.trim().toLowerCase();
      return name === root || name.endsWith(`.${root}`);
    })
    .map((instruction) => {
      const name = instruction.name.trim().toLowerCase();
      const host = name === root ? '' : name.slice(0, name.length - root.length - 1);
      const type = host === '' && instruction.type === 'CNAME' ? 'ALIAS' : instruction.type;
      const ttlSeconds =
        instruction.ttlSeconds && instruction.ttlSeconds > MIN_TTL_SECONDS
          ? instruction.ttlSeconds
          : MIN_TTL_SECONDS;
      return { type, host, value: instruction.value, ttlSeconds };
    });
}
