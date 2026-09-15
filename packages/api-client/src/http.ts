import { AppError, type ApiErrorBody, type ErrorCode } from '@starter/domain';

export interface HttpClientOptions {
  baseUrl: string;
  /** Enviar cookies (necesario para Cloudflare Access en el admin). */
  withCredentials?: boolean;
  /** Cabeceras extra (p.ej. para tests o entornos especiales). */
  defaultHeaders?: Record<string, string>;
}

/**
 * Wrapper de fetch que normaliza errores al contrato ApiErrorBody y los
 * reconstruye como AppError. Es el único lugar donde el frontend toca `fetch`.
 */
export function createHttpClient(opts: HttpClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, '');

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const isForm = body instanceof FormData;
    const headers = new Headers({ Accept: 'application/json', ...opts.defaultHeaders });
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    if (body !== undefined && !isForm) headers.set('Content-Type', 'application/json');

    const res = await fetch(`${base}${path}`, {
      ...init,
      method,
      headers,
      credentials: opts.withCredentials ? 'include' : 'same-origin',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const data = text ? safeJson(text) : undefined;

    if (!res.ok) {
      throw toAppError(res.status, data);
    }
    return data as T;
  }

  return {
    get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
    post: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>('POST', path, body, init),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>('PATCH', path, body, init),
    del: <T>(path: string, init?: RequestInit) => request<T>('DELETE', path, undefined, init),
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function toAppError(status: number, data: unknown): AppError {
  const body = data as Partial<ApiErrorBody> | undefined;
  if (body?.error?.code) {
    return new AppError(
      body.error.code as ErrorCode,
      body.error.message ?? 'Error',
      body.error.details,
    );
  }
  const fallback: ErrorCode = status >= 500 ? 'internal_error' : 'validation_error';
  return new AppError(fallback, `Error HTTP ${status}`);
}
