const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Verifica un token de Turnstile contra el endpoint de Cloudflare (server-side). */
export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp?: string | null,
): Promise<boolean> {
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);

  const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
