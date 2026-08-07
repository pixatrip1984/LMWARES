/**
 * Cliente best-effort para la Google Indexing API. Notifica a Google que una
 * URL fue actualizada para acelerar el rastreo; nunca debe bloquear ni fallar
 * el flujo de publicación que lo invoca — cualquier error se atrapa y se
 * reporta como resultado, no como excepción.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_INDEXING_PUBLISH_URL =
  'https://indexing.googleapis.com/v3/urlNotifications:publish';
const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GoogleIndexingClientOptions {
  /** client_email del service account (rol "Owner" delegado en Search Console). */
  clientEmail: string;
  /** private_key PEM del mismo service account. Acepta \n literales o reales. */
  privateKeyPem: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type GoogleIndexingResult =
  | { ok: true; url: string }
  | { ok: false; url: string; reason: string };

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Cliente Google Indexing API vía un service account (auth JWT RS256 firmado
 * con Web Crypto, sin dependencias externas — compatible con el runtime de
 * Cloudflare Workers).
 */
export class GoogleIndexingClient {
  private readonly clientEmail: string;
  private readonly privateKeyPem: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GoogleIndexingClientOptions) {
    this.clientEmail = options.clientEmail;
    this.privateKeyPem = options.privateKeyPem;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async signedAssertion(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: this.clientEmail,
      scope: INDEXING_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(
      JSON.stringify(claims),
    )}`;
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(this.privateKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
  }

  private async accessToken(): Promise<string> {
    const assertion = await this.signedAssertion();
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      throw new Error(`Google OAuth token request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as { access_token?: string };
    if (!payload.access_token) {
      throw new Error('Google OAuth token response missing access_token');
    }
    return payload.access_token;
  }

  /**
   * Notifica a Google que `url` fue creada/actualizada. Best-effort: nunca
   * lanza — cualquier fallo (credenciales, red, cuota) se devuelve como
   * `{ ok: false, reason }` para que el llamador lo registre sin abortar la
   * publicación del sitio.
   */
  async notifyUrlUpdated(url: string): Promise<GoogleIndexingResult> {
    try {
      const accessToken = await this.accessToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(GOOGLE_INDEXING_PUBLISH_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url, type: 'URL_UPDATED' }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return {
          ok: false,
          url,
          reason: `Google Indexing API status ${response.status}: ${detail.slice(0, 300)}`,
        };
      }
      return { ok: true, url };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      return { ok: false, url, reason };
    }
  }
}
