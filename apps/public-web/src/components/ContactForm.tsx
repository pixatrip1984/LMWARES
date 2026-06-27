import { useCallback, useState } from 'react';
import { AppError } from '@starter/domain';
import { Button, ErrorBanner, Field, Input, Textarea } from '@starter/ui';
import { api } from '../lib/api';
import { config } from '../lib/config';
import { Turnstile } from './Turnstile';

/** Formulario público de solicitud/contacto. Envía a POST /requests con Turnstile. */
export function ContactForm({ publicationId }: { publicationId?: string }) {
  const [form, setForm] = useState({ contactName: '', contactEmail: '', contactPhone: '', message: '' });
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onToken = useCallback((t: string | null) => setToken(t), []);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // En local sin site key, el Worker omite Turnstile: mandamos un token marcador.
    const turnstileToken = token ?? (config.turnstileSiteKey ? '' : 'dev-bypass');
    if (config.turnstileSiteKey && !turnstileToken) {
      setError('Completa la verificación anti-spam.');
      return;
    }
    setStatus('sending');
    try {
      await api.createRequest({
        type: 'contact',
        publicationId: publicationId ?? null,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone || null,
        message: form.message || null,
        payload: {},
        turnstileToken,
      });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof AppError ? err.message : 'No se pudo enviar la solicitud.');
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
        ¡Gracias! Tu solicitud fue enviada. Te contactaremos pronto.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-lg">
      {error ? <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div> : null}
      <Field label="Nombre">
        <Input required value={form.contactName} onChange={update('contactName')} />
      </Field>
      <Field label="Email">
        <Input type="email" required value={form.contactEmail} onChange={update('contactEmail')} />
      </Field>
      <Field label="Teléfono (opcional)">
        <Input value={form.contactPhone} onChange={update('contactPhone')} />
      </Field>
      <Field label="Mensaje (opcional)">
        <Textarea rows={4} value={form.message} onChange={update('message')} />
      </Field>
      <div className="mb-4">
        <Turnstile siteKey={config.turnstileSiteKey} onToken={onToken} />
      </div>
      <Button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Enviar solicitud'}
      </Button>
    </form>
  );
}
