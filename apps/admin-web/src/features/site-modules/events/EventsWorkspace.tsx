import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  eventsApi,
  type EventRecord,
  type EventRegistration,
  type EventStatus,
  type EventWritePayload,
  type RegistrationStatus,
} from './eventsApi';
import './eventsWorkspace.css';

export interface EventsWorkspaceProps {
  projectId: string;
}

interface EventFormState {
  id: string | null;
  slug: string;
  title: string;
  summary: string;
  description: string;
  venueName: string;
  venueAddress: string;
  timezone: string;
  startsLocal: string;
  endsLocal: string;
  registrationClosesLocal: string;
  capacity: string;
  coverAssetId: string;
}

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  cancelled: 'Cancelado',
  completed: 'Finalizado',
};

export function EventsWorkspace({ projectId }: EventsWorkspaceProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [publishedEvents, setPublishedEvents] = useState<EventRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(() => emptyForm());
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [previewEvent, setPreviewEvent] = useState<EventRecord | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedEvent = events.find((event) => event.id === selectedId) ?? null;
  const confirmedCount = registrations.filter(
    (registration) => registration.status === 'confirmed',
  ).length;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([eventsApi.list(projectId), eventsApi.listPublished(projectId)])
      .then(async ([items, published]) => {
        if (cancelled) return;
        setEvents(items);
        setPublishedEvents(published);
        const first = items[0] ?? null;
        setSelectedId(first?.id ?? null);
        setForm(first ? formFromEvent(first) : emptyForm());
        setCalendarCursor(first ? new Date(first.startsAtUtc) : new Date());
        if (first) {
          const detail = await eventsApi.get(projectId, first.id);
          if (!cancelled) setRegistrations(detail.registrations);
        } else {
          setRegistrations([]);
        }
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
  }, [projectId]);

  const publicAgenda = useMemo(() => {
    if (!previewEvent) return publishedEvents;
    const withoutPreviewed = publishedEvents.filter((event) => event.id !== previewEvent.id);
    return [previewEvent, ...withoutPreviewed];
  }, [publishedEvents, previewEvent]);

  async function selectEvent(event: EventRecord) {
    setSelectedId(event.id);
    setForm(formFromEvent(event));
    setPreviewEvent(null);
    setError(null);
    setNotice(null);
    setCalendarCursor(new Date(event.startsAtUtc));
    try {
      const detail = await eventsApi.get(projectId, event.id);
      setRegistrations(detail.registrations);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudieron cargar los asistentes.'));
    }
  }

  function startNewEvent() {
    setSelectedId(null);
    setForm(emptyForm());
    setRegistrations([]);
    setPreviewEvent(null);
    setError(null);
    setNotice(null);
  }

  function updateForm<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'title' && (!current.slug || current.slug === slugify(current.title))) {
        next.slug = slugify(String(value));
      }
      return next;
    });
    setPreviewEvent(null);
  }

  async function saveFields(): Promise<EventRecord> {
    const input = payloadFromForm(form);
    const saved = form.id
      ? await eventsApi.update(projectId, form.id, input)
      : await eventsApi.create(projectId, input);
    setSelectedId(saved.id);
    setForm(formFromEvent(saved));
    setEvents((current) => upsertEvent(current, saved));
    return saved;
  }

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      let saved = await saveFields();
      if (saved.status !== 'draft') {
        saved = await eventsApi.setStatus(projectId, saved.id, 'draft');
      }
      await refreshEvent(saved);
      setNotice(
        saved.publishedRevisionAt
          ? 'Borrador guardado. La versión pública anterior sigue activa.'
          : 'Borrador guardado. No aparece en la agenda pública.',
      );
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo guardar el borrador.'));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveFields();
      const published = await eventsApi.setStatus(projectId, saved.id, 'published');
      await refreshEvent(published);
      setNotice('Evento publicado en la agenda.');
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo publicar el evento.'));
    } finally {
      setSaving(false);
    }
  }

  async function setLifecycle(status: Extract<EventStatus, 'cancelled' | 'completed'>) {
    if (!form.id) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await eventsApi.setStatus(projectId, form.id, status);
      await refreshEvent(updated);
      setNotice(
        status === 'cancelled'
          ? 'Evento cancelado; permanece visible con aviso público.'
          : 'Evento marcado como finalizado.',
      );
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo actualizar el estado.'));
    } finally {
      setSaving(false);
    }
  }

  function preview() {
    setError(null);
    setNotice(null);
    try {
      const payload = payloadFromForm(form);
      setPreviewEvent(previewFromForm(form, payload, selectedEvent));
      setNotice('Previsualización local activa; aún no se guardó ningún cambio.');
    } catch (cause) {
      setError(errorMessage(cause, 'Completa los datos obligatorios para previsualizar.'));
    }
  }

  async function changeRegistrationStatus(
    registration: EventRegistration,
    status: RegistrationStatus,
  ) {
    if (!form.id) return;
    setError(null);
    try {
      const updated = await eventsApi.setRegistrationStatus(
        projectId,
        form.id,
        registration.id,
        status,
      );
      setRegistrations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      const detail = await eventsApi.listRegistrations(projectId, form.id);
      const published = await eventsApi.listPublished(projectId);
      setEvents((current) => upsertEvent(current, detail.event));
      setPublishedEvents(published);
      setRegistrations(detail.registrations);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo actualizar la inscripción.'));
    }
  }

  async function refreshEvent(event: EventRecord) {
    setEvents((current) => upsertEvent(current, event));
    setForm(formFromEvent(event));
    setSelectedId(event.id);
    setPreviewEvent(null);
    const [detail, published] = await Promise.all([
      eventsApi.get(projectId, event.id),
      eventsApi.listPublished(projectId),
    ]);
    setEvents((current) => upsertEvent(current, detail.event));
    setPublishedEvents(published);
    setRegistrations(detail.registrations);
  }

  if (loading) {
    return (
      <div className="lm-events-workspace lm-events-workspace--loading" aria-live="polite">
        <span className="lm-events-spinner" />
        Preparando agenda y asistentes…
      </div>
    );
  }

  return (
    <section className="lm-events-workspace">
      <header className="lm-events-toolbar">
        <div>
          <span className="lm-events-eyebrow">Módulo del sitio · Eventos</span>
          <h1>Agenda, cupo e inscripciones</h1>
        </div>
        <div className="lm-events-toolbar__actions">
          <button type="button" className="lm-events-button is-ghost" onClick={preview}>
            Previsualizar
          </button>
          <button
            type="button"
            className="lm-events-button is-secondary"
            onClick={() => void saveDraft()}
            disabled={saving}
          >
            Guardar borrador
          </button>
          <button
            type="button"
            className="lm-events-button is-primary"
            onClick={() => void publish()}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Publicar'}
          </button>
        </div>
      </header>

      {error ? <div className="lm-events-message is-error">{error}</div> : null}
      {notice ? <div className="lm-events-message is-success">{notice}</div> : null}

      <div className="lm-events-split">
        <AgendaPreview
          events={publicAgenda}
          activeId={previewEvent?.id ?? selectedId}
          previewing={Boolean(previewEvent)}
          onSelect={(event) => void selectEvent(event)}
        />

        <div className="lm-events-admin">
          <div className="lm-events-admin__overview">
            <MiniCalendar
              cursor={calendarCursor}
              events={events}
              selectedId={selectedId}
              onCursorChange={setCalendarCursor}
              onSelect={(event) => void selectEvent(event)}
            />

            <div className="lm-events-list-panel">
              <div className="lm-events-panel-heading">
                <div>
                  <span>Listado</span>
                  <strong>{events.length} eventos</strong>
                </div>
                <button type="button" onClick={startNewEvent}>
                  + Nueva fecha
                </button>
              </div>
              <div className="lm-events-admin-list">
                {events.length === 0 ? (
                  <div className="lm-events-empty is-compact">
                    La agenda está vacía. Crea la primera fecha.
                  </div>
                ) : (
                  events.map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      className={event.id === selectedId ? 'is-active' : ''}
                      onClick={() => void selectEvent(event)}
                    >
                      <DateTile event={event} />
                      <span className="lm-events-admin-list__copy">
                        <strong>{event.title}</strong>
                        <small>
                          {event.registrationCount} inscritos ·{' '}
                          {event.capacity === null ? 'sin límite' : `${event.capacity} lugares`}
                        </small>
                      </span>
                      <StatusChip event={event} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <form className="lm-events-editor" onSubmit={(event) => void saveDraft(event)}>
            <div className="lm-events-editor__heading">
              <div>
                <span>{form.id ? 'Editar evento' : 'Nueva fecha'}</span>
                <h2>{form.title || 'Evento sin título'}</h2>
              </div>
              {selectedEvent ? <StatusChip event={selectedEvent} /> : null}
            </div>

            <div className="lm-events-fields">
              <label className="is-wide">
                <span>Título</span>
                <input
                  required
                  minLength={3}
                  maxLength={180}
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                  placeholder="Taller, presentación, encuentro…"
                />
              </label>
              <label>
                <span>Slug público</span>
                <input
                  required
                  value={form.slug}
                  onChange={(event) => updateForm('slug', slugify(event.target.value))}
                  placeholder="nombre-del-evento"
                />
              </label>
              <label>
                <span>Zona de presentación</span>
                <input
                  required
                  value={form.timezone}
                  onChange={(event) => updateForm('timezone', event.target.value)}
                  placeholder="America/Mexico_City"
                />
              </label>
              <label className="is-wide">
                <span>Resumen para la agenda</span>
                <input
                  maxLength={360}
                  value={form.summary}
                  onChange={(event) => updateForm('summary', event.target.value)}
                  placeholder="Una línea clara para decidir si asistir."
                />
              </label>
              <label>
                <span>Inicio</span>
                <input
                  required
                  type="datetime-local"
                  value={form.startsLocal}
                  onChange={(event) => updateForm('startsLocal', event.target.value)}
                />
              </label>
              <label>
                <span>Fin</span>
                <input
                  required
                  type="datetime-local"
                  value={form.endsLocal}
                  onChange={(event) => updateForm('endsLocal', event.target.value)}
                />
              </label>
              <label>
                <span>Cierre de inscripción</span>
                <input
                  type="datetime-local"
                  value={form.registrationClosesLocal}
                  onChange={(event) => updateForm('registrationClosesLocal', event.target.value)}
                />
              </label>
              <label>
                <span>Cupo</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={form.capacity}
                  onChange={(event) => updateForm('capacity', event.target.value)}
                  placeholder="Vacío = sin límite"
                />
              </label>
              <label>
                <span>Lugar</span>
                <input
                  maxLength={180}
                  value={form.venueName}
                  onChange={(event) => updateForm('venueName', event.target.value)}
                  placeholder="Nombre del recinto o En línea"
                />
              </label>
              <label>
                <span>Dirección</span>
                <input
                  maxLength={500}
                  value={form.venueAddress}
                  onChange={(event) => updateForm('venueAddress', event.target.value)}
                  placeholder="Dirección o URL de acceso"
                />
              </label>
              <label className="is-wide">
                <span>Descripción</span>
                <textarea
                  rows={5}
                  maxLength={12000}
                  value={form.description}
                  onChange={(event) => updateForm('description', event.target.value)}
                  placeholder="Programa, requisitos y qué puede esperar el asistente."
                />
              </label>
              <label className="is-wide">
                <span>Portada · file_assets / R2 (opcional)</span>
                <input
                  value={form.coverAssetId}
                  onChange={(event) => updateForm('coverAssetId', event.target.value)}
                  placeholder="UUID de un asset ya registrado"
                />
              </label>
            </div>

            <div className="lm-events-editor__footer">
              <div className="lm-events-state-actions">
                {selectedEvent?.status === 'published' ? (
                  <button
                    type="button"
                    onClick={() => void setLifecycle('cancelled')}
                    disabled={saving}
                  >
                    Cancelar evento
                  </button>
                ) : null}
                {selectedEvent && selectedEvent.status !== 'completed' ? (
                  <button
                    type="button"
                    onClick={() => void setLifecycle('completed')}
                    disabled={saving}
                  >
                    Marcar finalizado
                  </button>
                ) : null}
              </div>
              <span>
                Fechas almacenadas en UTC · vista en <strong>{form.timezone}</strong>
              </span>
            </div>
          </form>

          <section className="lm-events-attendees">
            <div className="lm-events-attendees__heading">
              <div>
                <span>Asistentes</span>
                <h2>
                  {confirmedCount} confirmados
                  {selectedEvent?.capacity ? ` de ${selectedEvent.capacity}` : ''}
                </h2>
              </div>
              <small>Visible solo en administración</small>
            </div>
            {!form.id ? (
              <div className="lm-events-empty is-compact">
                Guarda el evento para comenzar a recibir inscripciones.
              </div>
            ) : registrations.length === 0 ? (
              <div className="lm-events-empty is-compact">Aún no hay asistentes registrados.</div>
            ) : (
              <div className="lm-events-attendee-table">
                <div className="lm-events-attendee-table__head">
                  <span>Asistente</span>
                  <span>Contacto</span>
                  <span>Registro</span>
                  <span>Estado</span>
                </div>
                {registrations.map((registration) => (
                  <div className="lm-events-attendee-table__row" key={registration.id}>
                    <span>
                      <strong>{registration.fullName}</strong>
                      <small>{registration.notes || 'Sin notas'}</small>
                    </span>
                    <span>
                      <strong>{registration.email}</strong>
                      <small>{registration.phone || 'Sin teléfono'}</small>
                    </span>
                    <span>{formatShortDate(registration.createdAt)}</span>
                    <span className="lm-events-registration-state">
                      <i className={`is-${registration.status}`}>
                        {registration.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}
                      </i>
                      <button
                        type="button"
                        onClick={() =>
                          void changeRegistrationStatus(
                            registration,
                            registration.status === 'confirmed' ? 'cancelled' : 'confirmed',
                          )
                        }
                      >
                        {registration.status === 'confirmed' ? 'Cancelar' : 'Restaurar'}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function AgendaPreview({
  events,
  activeId,
  previewing,
  onSelect,
}: {
  events: EventRecord[];
  activeId: string | null;
  previewing: boolean;
  onSelect: (event: EventRecord) => void;
}) {
  const active = events.find((event) => event.id === activeId) ?? events[0] ?? null;

  return (
    <aside className="lm-events-preview">
      <div className="lm-events-preview__browser">
        <span />
        <span />
        <span />
        <small>{previewing ? 'PREVISUALIZACIÓN LOCAL' : 'AGENDA PÚBLICA'}</small>
      </div>
      <div className="lm-events-preview__hero">
        <span>Próximas fechas</span>
        <h2>Encuentros para aprender, conectar y avanzar.</h2>
        <p>Consulta el programa y reserva tu lugar en unos minutos.</p>
      </div>

      {events.length === 0 ? (
        <div className="lm-events-empty">
          <strong>La agenda pública aún está vacía.</strong>
          <span>Publica una fecha o usa Previsualizar para verla aquí.</span>
        </div>
      ) : (
        <>
          <div className="lm-events-preview__agenda">
            {events.map((event) => (
              <button
                type="button"
                key={event.id}
                className={active?.id === event.id ? 'is-active' : ''}
                onClick={() => onSelect(event)}
              >
                <DateTile event={event} />
                <span>
                  <small>{event.venueName || 'Ubicación por confirmar'}</small>
                  <strong>{event.title}</strong>
                  <em>{formatTimeRange(event)}</em>
                </span>
                <b>→</b>
              </button>
            ))}
          </div>

          {active ? (
            <article className="lm-events-preview__detail">
              {active.coverUrl ? (
                <img src={active.coverUrl} alt="" />
              ) : (
                <div className="lm-events-preview__cover">
                  <span>{formatMonth(active.startsAtUtc, active.timezone)}</span>
                  <b>{formatDay(active.startsAtUtc, active.timezone)}</b>
                </div>
              )}
              <div>
                <StatusChip event={active} />
                <h3>{active.title}</h3>
                <p>{active.summary || active.description || 'Detalles próximamente.'}</p>
                <dl>
                  <div>
                    <dt>Fecha</dt>
                    <dd>{formatFullDate(active)}</dd>
                  </div>
                  <div>
                    <dt>Lugar</dt>
                    <dd>{active.venueName || 'Por confirmar'}</dd>
                  </div>
                  <div>
                    <dt>Cupo</dt>
                    <dd>
                      {active.capacity === null
                        ? 'Sin límite'
                        : `${active.spotsRemaining ?? active.capacity} lugares disponibles`}
                    </dd>
                  </div>
                </dl>
                <button type="button" disabled={active.status !== 'published'}>
                  {active.status === 'cancelled'
                    ? 'Evento cancelado'
                    : active.status === 'completed'
                      ? 'Evento finalizado'
                      : 'Reservar mi lugar'}
                </button>
              </div>
            </article>
          ) : null}
        </>
      )}
    </aside>
  );
}

function MiniCalendar({
  cursor,
  events,
  selectedId,
  onCursorChange,
  onSelect,
}: {
  cursor: Date;
  events: EventRecord[];
  selectedId: string | null;
  onCursorChange: (date: Date) => void;
  onSelect: (event: EventRecord) => void;
}) {
  const days = calendarDays(cursor);
  const monthLabel = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(cursor);

  return (
    <div className="lm-events-calendar">
      <div className="lm-events-calendar__heading">
        <div>
          <span>Calendario</span>
          <strong>{monthLabel}</strong>
        </div>
        <div>
          <button type="button" onClick={() => onCursorChange(addMonths(cursor, -1))}>
            ‹
          </button>
          <button type="button" onClick={() => onCursorChange(addMonths(cursor, 1))}>
            ›
          </button>
        </div>
      </div>
      <div className="lm-events-calendar__week">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="lm-events-calendar__grid">
        {days.map((day) => {
          const key = localDateKey(day);
          const dayEvents = events.filter((event) => eventDateKey(event) === key);
          const event = dayEvents[0];
          const outside = day.getMonth() !== cursor.getMonth();
          return (
            <button
              type="button"
              key={key}
              className={[
                outside ? 'is-outside' : '',
                dayEvents.length ? 'has-event' : '',
                dayEvents.some((item) => item.id === selectedId) ? 'is-selected' : '',
              ].join(' ')}
              onClick={() => event && onSelect(event)}
              disabled={!event}
              title={dayEvents.map((item) => item.title).join(', ')}
            >
              {day.getDate()}
              {dayEvents.length ? <i>{dayEvents.length}</i> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateTile({ event }: { event: EventRecord }) {
  return (
    <span className="lm-events-date-tile">
      <small>{formatMonth(event.startsAtUtc, event.timezone)}</small>
      <strong>{formatDay(event.startsAtUtc, event.timezone)}</strong>
    </span>
  );
}

function StatusChip({ event }: { event: EventRecord }) {
  const label =
    event.publishedRevisionAt && event.hasUnpublishedChanges
      ? 'Publicado · cambios sin publicar'
      : event.publishedRevisionAt && event.status === 'draft'
        ? 'Publicado · borrador activo'
        : STATUS_LABELS[event.status];
  return <span className={`lm-events-status is-${event.status}`}>{label}</span>;
}

function emptyForm(): EventFormState {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return {
    id: null,
    slug: '',
    title: '',
    summary: '',
    description: '',
    venueName: '',
    venueAddress: '',
    timezone,
    startsLocal: isoToZonedInput(start.toISOString(), timezone),
    endsLocal: isoToZonedInput(end.toISOString(), timezone),
    registrationClosesLocal: '',
    capacity: '',
    coverAssetId: '',
  };
}

function formFromEvent(event: EventRecord): EventFormState {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary ?? '',
    description: event.description ?? '',
    venueName: event.venueName ?? '',
    venueAddress: event.venueAddress ?? '',
    timezone: event.timezone,
    startsLocal: isoToZonedInput(event.startsAtUtc, event.timezone),
    endsLocal: isoToZonedInput(event.endsAtUtc, event.timezone),
    registrationClosesLocal: event.registrationClosesAtUtc
      ? isoToZonedInput(event.registrationClosesAtUtc, event.timezone)
      : '',
    capacity: event.capacity === null ? '' : String(event.capacity),
    coverAssetId: event.coverAssetId ?? '',
  };
}

function payloadFromForm(form: EventFormState): EventWritePayload {
  if (form.title.trim().length < 3) throw new Error('Escribe un título de al menos 3 caracteres.');
  if (!form.slug) throw new Error('El evento necesita un slug público.');
  if (!form.startsLocal || !form.endsLocal) {
    throw new Error('Completa las fechas de inicio y fin.');
  }
  const startsAtUtc = zonedInputToIso(form.startsLocal, form.timezone);
  const endsAtUtc = zonedInputToIso(form.endsLocal, form.timezone);
  if (endsAtUtc <= startsAtUtc) throw new Error('La fecha de fin debe ser posterior al inicio.');
  const registrationClosesAtUtc = form.registrationClosesLocal
    ? zonedInputToIso(form.registrationClosesLocal, form.timezone)
    : null;
  if (registrationClosesAtUtc && registrationClosesAtUtc > startsAtUtc) {
    throw new Error('El cierre de inscripción no puede ser posterior al inicio.');
  }
  const capacity = form.capacity.trim() ? Number(form.capacity) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    throw new Error('El cupo debe ser un entero positivo o quedar vacío.');
  }

  return {
    slug: form.slug,
    title: form.title.trim(),
    summary: textOrNull(form.summary),
    description: textOrNull(form.description),
    venueName: textOrNull(form.venueName),
    venueAddress: textOrNull(form.venueAddress),
    timezone: form.timezone.trim(),
    startsAtUtc,
    endsAtUtc,
    registrationClosesAtUtc,
    capacity,
    coverAssetId: textOrNull(form.coverAssetId),
  };
}

function previewFromForm(
  form: EventFormState,
  payload: EventWritePayload,
  existing: EventRecord | null,
): EventRecord {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? 'local-preview',
    projectId: existing?.projectId ?? 'preview',
    ...payload,
    status: existing?.status ?? 'draft',
    cover: existing?.cover ?? null,
    coverUrl: existing?.coverUrl ?? null,
    publishedAt: existing?.publishedAt ?? null,
    publishedRevisionAt: existing?.publishedRevisionAt ?? null,
    hasUnpublishedChanges: existing?.hasUnpublishedChanges ?? false,
    createdBy: existing?.createdBy ?? 'preview',
    updatedBy: existing?.updatedBy ?? 'preview',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    registrationCount: existing?.registrationCount ?? 0,
    spotsRemaining:
      payload.capacity === null
        ? null
        : Math.max(0, payload.capacity - (existing?.registrationCount ?? 0)),
    registrationOpen: existing?.status === 'published',
  };
}

function upsertEvent(events: EventRecord[], event: EventRecord): EventRecord[] {
  const exists = events.some((item) => item.id === event.id);
  const next = exists
    ? events.map((item) => (item.id === event.id ? event : item))
    : [...events, event];
  return next.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function textOrNull(value: string): string | null {
  const text = value.trim();
  return text || null;
}

function isoToZonedInput(iso: string, timeZone: string): string {
  const parts = dateParts(new Date(iso), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zonedInputToIso(value: string, timeZone: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Fecha inválida.');
  const [, year, month, day, hour, minute] = match;
  const intendedUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  let result = intendedUtc;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = dateParts(new Date(result), timeZone);
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    result += intendedUtc - representedUtc;
  }
  return new Date(result).toISOString();
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

function formatMonth(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    month: 'short',
  })
    .format(new Date(iso))
    .replace('.', '')
    .toUpperCase();
}

function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    day: '2-digit',
  }).format(new Date(iso));
}

function formatTimeRange(event: EventRecord): string {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: event.timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(new Date(event.startsAtUtc))} – ${formatter.format(new Date(event.endsAtUtc))}`;
}

function formatFullDate(event: EventRecord): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: event.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(event.startsAtUtc));
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function eventDateKey(event: EventRecord): string {
  const parts = dateParts(new Date(event.startsAtUtc), event.timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function calendarDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
