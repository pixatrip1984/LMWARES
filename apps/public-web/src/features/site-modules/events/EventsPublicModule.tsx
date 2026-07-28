import { createHttpClient } from '@starter/api-client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { config } from '../../../lib/config';
import './eventsPublicModule.css';

export interface EventsPublicModuleProps {
  projectId: string;
  apiBaseUrl?: string;
}

type EventStatus = 'published' | 'cancelled' | 'completed';

interface PublicEvent {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  timezone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationClosesAtUtc: string | null;
  capacity: number | null;
  status: EventStatus;
  coverAssetId: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  registrationCount: number;
  spotsRemaining: number | null;
  registrationOpen: boolean;
}

interface RegistrationForm {
  fullName: string;
  email: string;
  phone: string;
  notes: string;
}

const EMPTY_REGISTRATION: RegistrationForm = {
  fullName: '',
  email: '',
  phone: '',
  notes: '',
};

export function EventsPublicModule({ projectId, apiBaseUrl }: EventsPublicModuleProps) {
  const http = useMemo(
    () => createHttpClient({ baseUrl: apiBaseUrl ?? config.apiUrl }),
    [apiBaseUrl],
  );
  const basePath = `/sites/${encodeURIComponent(projectId)}/events`;
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [selected, setSelected] = useState<PublicEvent | null>(null);
  const [registration, setRegistration] = useState<RegistrationForm>(EMPTY_REGISTRATION);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    http
      .get<{ events: PublicEvent[] }>(basePath)
      .then((response) => {
        if (cancelled) return;
        setEvents(response.events);
        setSelected(response.events[0] ?? null);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause, 'No se pudo cargar la agenda.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [basePath, http]);

  const upcoming = events.filter((event) => event.endsAtUtc >= new Date().toISOString());
  const past = events.filter((event) => event.endsAtUtc < new Date().toISOString());

  async function selectEvent(event: PublicEvent) {
    setSelected(event);
    setError(null);
    setConfirmation(null);
    try {
      const response = await http.get<{ event: PublicEvent }>(
        `${basePath}/${encodeURIComponent(event.id)}`,
      );
      setSelected(response.event);
      setEvents((current) =>
        current.map((item) => (item.id === response.event.id ? response.event : item)),
      );
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo abrir el evento.'));
    }
  }

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    setConfirmation(null);
    try {
      const response = await http.post<{
        registration: { id: string; status: 'confirmed'; createdAt: string };
        event: PublicEvent;
      }>(`${basePath}/${encodeURIComponent(selected.id)}/registrations`, {
        fullName: registration.fullName,
        email: registration.email,
        phone: registration.phone.trim() || null,
        notes: registration.notes.trim() || null,
        website: '',
      });
      setSelected(response.event);
      setEvents((current) =>
        current.map((item) => (item.id === response.event.id ? response.event : item)),
      );
      setRegistration(EMPTY_REGISTRATION);
      setConfirmation(`Tu lugar quedó confirmado. Folio ${response.registration.id}.`);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo completar la inscripción.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="lm-events-public is-loading" aria-live="polite">
        <span className="lm-events-public__spinner" />
        Cargando agenda…
      </section>
    );
  }

  return (
    <section className="lm-events-public">
      <header className="lm-events-public__header">
        <div>
          <span>Agenda</span>
          <h1>Próximos eventos</h1>
          <p>Encuentra una fecha, consulta todos los detalles y reserva tu lugar.</p>
        </div>
        <strong>
          {upcoming.length} {upcoming.length === 1 ? 'fecha próxima' : 'fechas próximas'}
        </strong>
      </header>

      {error ? (
        <div className="lm-events-public__message is-error" role="alert">
          {error}
        </div>
      ) : null}

      {events.length === 0 ? (
        <div className="lm-events-public__empty">
          <span>Sin fechas publicadas</span>
          <h2>La siguiente cita está en preparación.</h2>
          <p>Vuelve pronto para consultar la agenda.</p>
        </div>
      ) : (
        <div className="lm-events-public__layout">
          <nav className="lm-events-public__agenda" aria-label="Agenda de eventos">
            <EventGroup
              title="Próximamente"
              events={upcoming}
              selectedId={selected?.id ?? null}
              onSelect={(event) => void selectEvent(event)}
            />
            {past.length ? (
              <EventGroup
                title="Eventos anteriores"
                events={past}
                selectedId={selected?.id ?? null}
                onSelect={(event) => void selectEvent(event)}
              />
            ) : null}
          </nav>

          {selected ? (
            <article className="lm-events-public__detail">
              {selected.coverUrl ? (
                <img className="lm-events-public__cover" src={selected.coverUrl} alt="" />
              ) : (
                <div className="lm-events-public__cover is-placeholder">
                  <small>{monthLabel(selected)}</small>
                  <strong>{dayLabel(selected)}</strong>
                </div>
              )}

              <div className="lm-events-public__content">
                <StatusNotice event={selected} />
                <span className="lm-events-public__kicker">
                  {selected.venueName || 'Ubicación por confirmar'}
                </span>
                <h2>{selected.title}</h2>
                <p className="lm-events-public__summary">
                  {selected.summary || 'Consulta los detalles de esta fecha.'}
                </p>

                <dl className="lm-events-public__facts">
                  <div>
                    <dt>Fecha</dt>
                    <dd>{fullDate(selected)}</dd>
                  </div>
                  <div>
                    <dt>Horario</dt>
                    <dd>{timeRange(selected)}</dd>
                  </div>
                  <div>
                    <dt>Lugar</dt>
                    <dd>
                      {selected.venueName || 'Por confirmar'}
                      {selected.venueAddress ? <small>{selected.venueAddress}</small> : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Cupo</dt>
                    <dd>{capacityLabel(selected)}</dd>
                  </div>
                </dl>

                {selected.description ? (
                  <div className="lm-events-public__description">
                    {selected.description
                      .split(/\n+/)
                      .filter(Boolean)
                      .map((paragraph, index) => (
                        <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>
                      ))}
                  </div>
                ) : null}

                {confirmation ? (
                  <div className="lm-events-public__message is-success" role="status">
                    <strong>Inscripción confirmada</strong>
                    {confirmation}
                  </div>
                ) : null}

                {selected.registrationOpen ? (
                  <form
                    className="lm-events-public__form"
                    onSubmit={(event) => void submitRegistration(event)}
                  >
                    <div>
                      <span>Reserva tu lugar</span>
                      <h3>Datos de inscripción</h3>
                    </div>
                    <label>
                      <span>Nombre completo</span>
                      <input
                        required
                        minLength={2}
                        maxLength={140}
                        autoComplete="name"
                        value={registration.fullName}
                        onChange={(event) =>
                          setRegistration((current) => ({
                            ...current,
                            fullName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Correo</span>
                      <input
                        required
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                        value={registration.email}
                        onChange={(event) =>
                          setRegistration((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Teléfono (opcional)</span>
                      <input
                        type="tel"
                        maxLength={30}
                        autoComplete="tel"
                        value={registration.phone}
                        onChange={(event) =>
                          setRegistration((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Nota (opcional)</span>
                      <textarea
                        rows={3}
                        maxLength={600}
                        value={registration.notes}
                        onChange={(event) =>
                          setRegistration((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <input
                      className="lm-events-public__honeypot"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                    />
                    <button type="submit" disabled={submitting}>
                      {submitting ? 'Confirmando…' : 'Confirmar inscripción'}
                    </button>
                    <small>Usaremos tus datos únicamente para gestionar esta inscripción.</small>
                  </form>
                ) : (
                  <div className="lm-events-public__closed">{closedLabel(selected)}</div>
                )}
              </div>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function EventGroup({
  title,
  events,
  selectedId,
  onSelect,
}: {
  title: string;
  events: PublicEvent[];
  selectedId: string | null;
  onSelect: (event: PublicEvent) => void;
}) {
  if (!events.length) return null;
  return (
    <div className="lm-events-public__group">
      <h2>{title}</h2>
      {events.map((event) => (
        <button
          type="button"
          key={event.id}
          className={event.id === selectedId ? 'is-active' : ''}
          onClick={() => onSelect(event)}
        >
          <span className="lm-events-public__date">
            <small>{monthLabel(event)}</small>
            <strong>{dayLabel(event)}</strong>
          </span>
          <span className="lm-events-public__item-copy">
            <small>{event.venueName || 'Lugar por confirmar'}</small>
            <strong>{event.title}</strong>
            <em>{timeRange(event)}</em>
          </span>
          <i>→</i>
        </button>
      ))}
    </div>
  );
}

function StatusNotice({ event }: { event: PublicEvent }) {
  if (event.status === 'published') return null;
  return (
    <div className={`lm-events-public__status is-${event.status}`}>
      {event.status === 'cancelled' ? 'Este evento fue cancelado.' : 'Este evento ya finalizó.'}
    </div>
  );
}

function monthLabel(event: PublicEvent): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: event.timezone,
    month: 'short',
  })
    .format(new Date(event.startsAtUtc))
    .replace('.', '')
    .toUpperCase();
}

function dayLabel(event: PublicEvent): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: event.timezone,
    day: '2-digit',
  }).format(new Date(event.startsAtUtc));
}

function fullDate(event: PublicEvent): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: event.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(event.startsAtUtc));
}

function timeRange(event: PublicEvent): string {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: event.timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(new Date(event.startsAtUtc))} – ${formatter.format(new Date(event.endsAtUtc))}`;
}

function capacityLabel(event: PublicEvent): string {
  if (event.capacity === null) return 'Sin límite';
  if ((event.spotsRemaining ?? 0) <= 0) return 'Cupo completo';
  return `${event.spotsRemaining} ${event.spotsRemaining === 1 ? 'lugar disponible' : 'lugares disponibles'}`;
}

function closedLabel(event: PublicEvent): string {
  if (event.status === 'cancelled') return 'Inscripción no disponible: evento cancelado.';
  if (event.status === 'completed') return 'Este evento ya finalizó.';
  if (event.capacity !== null && event.spotsRemaining === 0) return 'Cupo completo.';
  return 'La inscripción para esta fecha está cerrada.';
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
