import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  PublicSiteForm,
  SiteFormAnswers,
  SiteFormField,
} from '@starter/domain';
import { Turnstile } from '../../../components/Turnstile';
import { config } from '../../../lib/config';
import './formPublicModule.css';

interface SubmissionResponse {
  submissionId: string;
  message: string;
}

export function FormPublicModule({
  projectId,
  apiBaseUrl,
}: {
  projectId: string;
  apiBaseUrl?: string;
}) {
  const [published, setPublished] = useState<PublicSiteForm | null>(null);
  const [answers, setAnswers] = useState<SiteFormAnswers>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SubmissionResponse | null>(null);

  const endpoint = useMemo(() => {
    const base = (apiBaseUrl ?? '').replace(/\/+$/, '');
    return `${base}/sites/${encodeURIComponent(projectId)}/forms`;
  }, [apiBaseUrl, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSuccess(null);

    void fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw await responseError(response);
        return (await response.json()) as PublicSiteForm;
      })
      .then((form) => {
        setPublished(form);
        setAnswers(initialAnswers(form));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [endpoint]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!published || submitting) return;
    if (config.turnstileSiteKey && !turnstileToken) {
      setError('Completa la verificación anti-spam.');
      return;
    }

    const formData = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/requests`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answers,
          website: String(formData.get('website') ?? ''),
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      if (!response.ok) throw await responseError(response);
      setSuccess((await response.json()) as SubmissionResponse);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  function setAnswer(fieldId: string, value: string | boolean) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  if (loading) {
    return (
      <section className="form-public-module form-public-module--state" aria-live="polite">
        Cargando formulario…
      </section>
    );
  }

  if (!published) {
    return (
      <section className="form-public-module form-public-module--state is-error" role="alert">
        {error ?? 'Este formulario no está disponible.'}
      </section>
    );
  }

  if (success) {
    return (
      <section className="form-public-module form-public-module--success" aria-live="polite">
        <span>✓</span>
        <p>Solicitud enviada</p>
        <h2>{success.message}</h2>
        <small>Folio {success.submissionId.slice(0, 8)}</small>
      </section>
    );
  }

  const { definition } = published;
  return (
    <section className="form-public-module">
      <div className="form-public-module__intro">
        <p className="form-public-module__kicker">SOLICITUD</p>
        <h2>{definition.title}</h2>
        {definition.description ? <p>{definition.description}</p> : null}
      </div>

      <form className="form-public-module__form" onSubmit={submit} noValidate>
        {definition.fields.map((field) => (
          <PublicField
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(value) => setAnswer(field.id, value)}
          />
        ))}

        <label className="form-public-module__honeypot" aria-hidden="true">
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>

        <div className="form-public-module__turnstile">
          <Turnstile siteKey={config.turnstileSiteKey} onToken={setTurnstileToken} />
        </div>

        {error ? (
          <p className="form-public-module__error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={submitting}>
          <span>{submitting ? 'Enviando…' : definition.submitLabel}</span>
          <span aria-hidden="true">↗</span>
        </button>
      </form>
    </section>
  );
}

function PublicField({
  field,
  value,
  onChange,
}: {
  field: SiteFormField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const label = (
    <span className="form-public-module__label">
      {field.label}
      {field.required ? <sup>*</sup> : null}
    </span>
  );
  const help = field.helpText ? <small id={`${field.id}-help`}>{field.helpText}</small> : null;
  const describedBy = field.helpText ? `${field.id}-help` : undefined;

  if (field.type === 'checkbox') {
    return (
      <label className="form-public-module__checkbox">
        <input
          name={field.id}
          type="checkbox"
          checked={value === true}
          required={field.required}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          {label}
          {help}
        </span>
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className="form-public-module__field">
        {label}
        <textarea
          name={field.id}
          value={typeof value === 'string' ? value : ''}
          required={field.required}
          minLength={field.minLength}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        {help}
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="form-public-module__field">
        {label}
        <select
          name={field.id}
          value={typeof value === 'string' ? value : ''}
          required={field.required}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{field.placeholder || 'Selecciona una opción'}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {help}
      </label>
    );
  }

  return (
    <label className="form-public-module__field">
      {label}
      <input
        name={field.id}
        type={field.type}
        value={typeof value === 'string' ? value : ''}
        required={field.required}
        minLength={field.minLength}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        aria-describedby={describedBy}
        autoComplete={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {help}
    </label>
  );
}

function initialAnswers(form: PublicSiteForm): SiteFormAnswers {
  return Object.fromEntries(
    form.definition.fields.map((field) => [field.id, field.type === 'checkbox' ? false : '']),
  );
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; details?: Record<string, string[]> };
    };
    const detail = body.error?.details
      ? Object.values(body.error.details).flat().filter(Boolean)[0]
      : undefined;
    return new Error(detail ?? body.error?.message ?? `Error HTTP ${response.status}`);
  } catch {
    return new Error(`Error HTTP ${response.status}`);
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'No fue posible enviar la solicitud.';
}
