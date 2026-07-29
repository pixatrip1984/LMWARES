import { AppError, type PackageProposal } from '@starter/domain';

const MERCADO_PAGO_API = 'https://api.mercadopago.com';
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const CHECKOUT_TTL_MS = 30 * 60 * 1000;

export interface MercadoPagoPreference {
  id: string;
  checkoutUrl: string;
  expiresAt: string;
}

export interface MercadoPagoPayment {
  id: string;
  status: string;
  externalReference: string;
  currency: string;
  amount: number;
  dateCreated: string | null;
}

export async function createMercadoPagoPreference(input: {
  accessToken: string;
  proposal: PackageProposal;
  payerEmail: string;
  testMode: boolean;
  publicApiUrl: string;
  publicWebUrl: string;
}): Promise<MercadoPagoPreference> {
  const validFrom = new Date();
  const expiresAt = new Date(validFrom.getTime() + CHECKOUT_TTL_MS).toISOString();
  const notificationUrl = publicHttpsUrl(input.publicApiUrl, '/payments/webhooks/mercado-pago');
  const paymentReturnUrl = publicHttpsUrl(
    input.publicWebUrl,
    `/pago/${encodeURIComponent(input.proposal.id)}`,
  );
  const preferenceBody: Record<string, unknown> = {
    items: [
      {
        id: `lmwares-${input.proposal.id}`,
        title: `Prueba técnica LMWares · ${capitalize(input.proposal.plan)}`,
        description: `Validación de Checkout Pro por MXN $${input.proposal.amountCents / 100}`,
        quantity: 1,
        currency_id: input.proposal.currency,
        unit_price: input.proposal.amountCents / 100,
      },
    ],
    payer: { email: input.payerEmail },
    external_reference: input.proposal.id,
    metadata: {
      proposal_id: input.proposal.id,
      pricing_version: input.proposal.pricingVersion,
    },
    statement_descriptor: 'LMWARES',
    binary_mode: true,
    expires: true,
    expiration_date_from: validFrom.toISOString(),
    expiration_date_to: expiresAt,
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      installments: 1,
    },
  };
  if (notificationUrl) preferenceBody.notification_url = notificationUrl;
  if (paymentReturnUrl) {
    preferenceBody.back_urls = {
      success: paymentReturnUrl,
      pending: paymentReturnUrl,
      failure: paymentReturnUrl,
    };
    preferenceBody.auto_return = 'approved';
  }

  const response = await fetch(`${MERCADO_PAGO_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `lmwares-${input.proposal.id}`,
    },
    body: JSON.stringify(preferenceBody),
  });

  const payload = await readProviderJson(response);
  if (!response.ok) throw providerError('crear la preferencia', response.status, payload);

  const id = stringField(payload, 'id');
  const checkoutUrl = input.testMode
    ? (optionalStringField(payload, 'sandbox_init_point') ?? stringField(payload, 'init_point'))
    : stringField(payload, 'init_point');
  assertMercadoPagoCheckoutUrl(checkoutUrl);
  return { id, checkoutUrl, expiresAt };
}

export async function expireMercadoPagoPreference(input: {
  accessToken: string;
  preferenceId: string;
  validFrom: string;
}): Promise<string> {
  const expiresAt = new Date(Date.now() + 1_000).toISOString();
  const response = await fetch(
    `${MERCADO_PAGO_API}/checkout/preferences/${encodeURIComponent(input.preferenceId)}`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires: true,
        expiration_date_from: input.validFrom,
        expiration_date_to: expiresAt,
      }),
    },
  );
  const payload = await readProviderJson(response);
  if (!response.ok) {
    throw providerError('vencer la preferencia pagada', response.status, payload);
  }
  return expiresAt;
}

export async function getMercadoPagoPayment(input: {
  accessToken: string;
  paymentId: string;
}): Promise<MercadoPagoPayment> {
  const response = await fetch(
    `${MERCADO_PAGO_API}/v1/payments/${encodeURIComponent(input.paymentId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );
  const payload = await readProviderJson(response);
  if (!response.ok) throw providerError('consultar el pago notificado', response.status, payload);
  const payment = parsePayment(payload);
  if (!payment) {
    throw new AppError('internal_error', 'Mercado Pago devolvió un pago inválido.');
  }
  return payment;
}

export async function searchMercadoPagoPayments(input: {
  accessToken: string;
  externalReference: string;
}): Promise<MercadoPagoPayment[]> {
  const query = new URLSearchParams({
    sort: 'date_created',
    criteria: 'desc',
    external_reference: input.externalReference,
  });
  const response = await fetch(`${MERCADO_PAGO_API}/v1/payments/search?${query}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
  const payload = await readProviderJson(response);
  if (!response.ok) throw providerError('consultar el pago', response.status, payload);

  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new AppError('internal_error', 'Mercado Pago devolvió una respuesta de pagos inválida.');
  }
  return payload.results
    .map(parsePayment)
    .filter((payment): payment is MercadoPagoPayment => payment !== null);
}

export async function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}): Promise<boolean> {
  const signatureFields = parseWebhookSignature(input.xSignature);
  if (!signatureFields) return false;
  const { timestamp, signatureHex } = signatureFields;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const manifestParts: string[] = [];
  if (input.dataId) {
    manifestParts.push(`id:${input.dataId.toLowerCase()}`);
  }
  if (input.xRequestId) {
    manifestParts.push(`request-id:${input.xRequestId}`);
  }
  manifestParts.push(`ts:${timestamp}`);
  const manifest = `${manifestParts.join(';')};`;
  return crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(signatureHex),
    new TextEncoder().encode(manifest),
  );
}

export function hasMercadoPagoWebhookSignatureFormat(value: string): boolean {
  return parseWebhookSignature(value) !== null;
}

function parseWebhookSignature(value: string): {
  timestamp: string;
  signatureHex: string;
} | null {
  const signatureFields = new Map<string, string>();
  for (const part of value.split(',')) {
    const [name, fieldValue] = part.split('=', 2).map((item) => item.trim());
    if (name && fieldValue) signatureFields.set(name, fieldValue);
  }
  const timestamp = signatureFields.get('ts');
  const signatureHex = signatureFields.get('v1');
  if (
    !timestamp ||
    !/^\d{10,16}$/.test(timestamp) ||
    !signatureHex ||
    !/^[a-f0-9]{64}$/i.test(signatureHex)
  ) {
    return null;
  }
  return { timestamp, signatureHex };
}

function parsePayment(value: unknown): MercadoPagoPayment | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'number' || typeof value.id === 'string' ? String(value.id) : null;
  const status = typeof value.status === 'string' ? value.status : null;
  const externalReference =
    typeof value.external_reference === 'string' ? value.external_reference : null;
  const currency = typeof value.currency_id === 'string' ? value.currency_id : null;
  const amount = typeof value.transaction_amount === 'number' ? value.transaction_amount : null;
  if (!id || !status || !externalReference || !currency || amount === null) return null;
  return {
    id,
    status,
    externalReference,
    currency,
    amount,
    dateCreated: typeof value.date_created === 'string' ? value.date_created : null,
  };
}

async function readProviderJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new AppError('internal_error', 'Mercado Pago devolvió una respuesta demasiado grande.');
  }
  if (!response.body) return {};

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new AppError('internal_error', 'Mercado Pago devolvió una respuesta demasiado grande.');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError('internal_error', 'Mercado Pago devolvió una respuesta no válida.');
  }
}

function providerError(action: string, status: number, payload: unknown): AppError {
  const safeProviderMessage =
    isRecord(payload) && typeof payload.message === 'string'
      ? payload.message.slice(0, 180)
      : `HTTP ${status}`;
  console.error(
    JSON.stringify({
      message: 'mercado_pago_request_failed',
      action,
      providerStatus: status,
      providerMessage: safeProviderMessage,
    }),
  );
  return new AppError(
    'internal_error',
    `No fue posible ${action} en Mercado Pago. Revisa las credenciales de prueba.`,
  );
}

function assertMercadoPagoCheckoutUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError('internal_error', 'Mercado Pago devolvió una URL de checkout inválida.');
  }
  const trusted =
    url.protocol === 'https:' &&
    (url.hostname === 'mercadopago.com.mx' || url.hostname.endsWith('.mercadopago.com.mx'));
  if (!trusted) {
    throw new AppError(
      'internal_error',
      'Mercado Pago devolvió un dominio de checkout inesperado.',
    );
  }
}

function stringField(value: unknown, field: string): string {
  const result = optionalStringField(value, field);
  if (!result) {
    throw new AppError('internal_error', `Mercado Pago no devolvió el campo ${field}.`);
  }
  return result;
}

function optionalStringField(value: unknown, field: string): string | null {
  return isRecord(value) && typeof value[field] === 'string' ? value[field] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function publicHttpsUrl(baseUrl: string, pathname: string): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    isLocalHostname(base.hostname)
  ) {
    return null;
  }
  return new URL(pathname, `${base.origin}/`).toString();
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '0.0.0.0' ||
    normalized.startsWith('127.') ||
    normalized.endsWith('.localhost')
  );
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
