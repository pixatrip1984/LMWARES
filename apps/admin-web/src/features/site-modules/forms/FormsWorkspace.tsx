import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  SiteForm,
  SiteFormDefinition,
  SiteFormField,
  SiteFormFieldType,
  SiteFormRequest,
  SiteFormRequestDetail,
  SiteFormRequestStatus,
} from '@starter/domain';
import { formsApi, type FormsWorkspaceResponse } from './formsApi';
import './formsWorkspace.css';

const FIELD_TYPES: Array<{ value: SiteFormFieldType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'Correo' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'textarea', label: 'Área de texto' },
  { value: 'select', label: 'Selección' },
  { value: 'checkbox', label: 'Checkbox' },
];

const REQUEST_STATUSES: Array<{ value: SiteFormRequestStatus; label: string }> = [
  { value: 'new', label: 'Nueva' },
  { value: 'in-progress', label: 'En proceso' },
  { value: 'responded', label: 'Respondida' },
  { value: 'closed', label: 'Cerrada' },
  { value: 'spam', label: 'Spam' },
];

export function FormsWorkspace({ projectId }: { projectId: string }) {
  const [workspace, setWorkspace] = useState<FormsWorkspaceResponse | null>(null);
  const [draft, setDraft] = useState<SiteFormDefinition | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SiteFormRequestDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'configuration'>('inbox');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [statusReason, setStatusReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedRequestId(null);
    setDetail(null);

    void formsApi
      .getWorkspace(projectId)
      .then((response) => {
        if (cancelled) return;
        setWorkspace(response);
        setDraft(response.form.draftDefinition);
        setSelectedRequestId(response.requests.items[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedRequestId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    void formsApi
      .getRequest(projectId, selectedRequestId)
      .then((response) => {
        if (!cancelled) setDetail(response);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedRequestId]);

  const isDirty = useMemo(
    () =>
      draft !== null &&
      workspace !== null &&
      JSON.stringify(draft) !== JSON.stringify(workspace.form.draftDefinition),
    [draft, workspace],
  );

  async function saveDraft(): Promise<SiteForm | null> {
    if (!draft) return null;
    setAction('save');
    setError(null);
    setNotice(null);
    try {
      const form = await formsApi.saveDefinition(projectId, draft);
      updateForm(form);
      setDraft(form.draftDefinition);
      setNotice('Borrador guardado.');
      return form;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    } finally {
      setAction(null);
    }
  }

  async function publishDraft() {
    if (!draft) return;
    setAction('publish');
    setError(null);
    setNotice(null);
    try {
      let currentForm = workspace?.form ?? null;
      if (isDirty) {
        currentForm = await formsApi.saveDefinition(projectId, draft);
        updateForm(currentForm);
        setDraft(currentForm.draftDefinition);
      }
      if (!currentForm) return;
      const published = await formsApi.publish(projectId);
      updateForm(published);
      setDraft(published.draftDefinition);
      setNotice(`Revisión ${published.publishedRevision ?? ''} publicada.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  }

  async function changeStatus(status: SiteFormRequestStatus) {
    if (!detail) return;
    setAction('status');
    setError(null);
    try {
      await formsApi.updateRequestStatus(
        projectId,
        detail.request.id,
        status,
        statusReason.trim() || undefined,
      );
      await refreshRequestData(detail.request.id);
      setStatusReason('');
      setNotice('Estado actualizado.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !noteBody.trim()) return;
    setAction('note');
    setError(null);
    try {
      await formsApi.addRequestNote(projectId, detail.request.id, noteBody.trim());
      const refreshed = await formsApi.getRequest(projectId, detail.request.id);
      setDetail(refreshed);
      setNoteBody('');
      setNotice('Nota interna agregada.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  }

  async function refreshRequestData(requestId: string) {
    const [requests, requestDetail] = await Promise.all([
      formsApi.listRequests(projectId, { page: 1, pageSize: 50 }),
      formsApi.getRequest(projectId, requestId),
    ]);
    setWorkspace((current) => (current ? { ...current, requests } : current));
    setDetail(requestDetail);
  }

  function updateForm(form: SiteForm) {
    setWorkspace((current) => (current ? { ...current, form } : current));
  }

  function updateDefinition<K extends keyof SiteFormDefinition>(
    key: K,
    value: SiteFormDefinition[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateField(fieldId: string, patch: Partial<SiteFormField>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.id === fieldId ? { ...field, ...patch } : field,
            ),
          }
        : current,
    );
  }

  function changeFieldType(fieldId: string, type: SiteFormFieldType) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        fields: current.fields.map((field) =>
          field.id === fieldId ? convertFieldType(field, type) : field,
        ),
      };
    });
  }

  function addField(type: SiteFormFieldType = 'text') {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: [...current.fields, newField(type)],
          }
        : current,
    );
  }

  function removeField(fieldId: string) {
    setDraft((current) =>
      current
        ? { ...current, fields: current.fields.filter((field) => field.id !== fieldId) }
        : current,
    );
  }

  function moveField(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const fields = [...current.fields];
      const currentField = fields[index];
      const targetField = fields[nextIndex];
      if (!currentField || !targetField) return current;
      fields[index] = targetField;
      fields[nextIndex] = currentField;
      return { ...current, fields };
    });
  }

  if (loading) {
    return <div className="forms-workspace forms-workspace--message">Cargando formulario…</div>;
  }

  if (!workspace || !draft) {
    return (
      <div className="forms-workspace forms-workspace--message forms-workspace--error">
        {error ?? 'No fue posible cargar el módulo.'}
      </div>
    );
  }

  return (
    <section className="forms-workspace" aria-label="Formulario y solicitudes">
      <aside className="forms-workspace__preview">
        <div className="forms-workspace__section-heading">
          <div>
            <span className="forms-workspace__eyebrow">Preview en vivo</span>
            <h2>Formulario público</h2>
          </div>
          <span className={isDirty ? 'forms-workspace__draft is-dirty' : 'forms-workspace__draft'}>
            {isDirty ? 'Cambios sin guardar' : `Borrador r${workspace.form.draftRevision}`}
          </span>
        </div>

        <div className="forms-workspace__canvas">
          <div className="forms-workspace__public-card">
            <p className="forms-workspace__public-kicker">SOLICITUD</p>
            <h3>{draft.title}</h3>
            {draft.description ? <p>{draft.description}</p> : null}
            <div className="forms-workspace__preview-fields">
              {draft.fields.map((field) => (
                <PreviewField key={field.id} field={field} />
              ))}
            </div>
            <button type="button" className="forms-workspace__preview-submit">
              {draft.submitLabel}
            </button>
          </div>
        </div>

        <div className="forms-workspace__publication-state">
          <span>
            Publicado:{' '}
            {workspace.form.publishedRevision
              ? `revisión ${workspace.form.publishedRevision}`
              : 'todavía no'}
          </span>
          <span>
            {workspace.form.publishedAt ? formatDate(workspace.form.publishedAt) : 'Sin fecha'}
          </span>
        </div>
      </aside>

      <div className="forms-workspace__operations">
        <header className="forms-workspace__toolbar">
          <div>
            <span className="forms-workspace__eyebrow">FORMULARIO / SOLICITUDES</span>
            <h1>Workspace</h1>
          </div>
          <nav className="forms-workspace__tabs" aria-label="Secciones del módulo">
            <button
              type="button"
              className={activeTab === 'inbox' ? 'is-active' : ''}
              onClick={() => setActiveTab('inbox')}
            >
              Inbox <span>{workspace.requests.total}</span>
            </button>
            <button
              type="button"
              className={activeTab === 'configuration' ? 'is-active' : ''}
              onClick={() => setActiveTab('configuration')}
            >
              Configuración
            </button>
          </nav>
        </header>

        {error ? <p className="forms-workspace__alert is-error">{error}</p> : null}
        {notice ? <p className="forms-workspace__alert is-success">{notice}</p> : null}

        {activeTab === 'inbox' ? (
          <div className="forms-workspace__inbox">
            <div className="forms-workspace__request-list">
              <div className="forms-workspace__list-heading">
                <strong>Solicitudes</strong>
                <span>Más recientes primero</span>
              </div>
              {workspace.requests.items.length === 0 ? (
                <p className="forms-workspace__empty">Aún no hay solicitudes.</p>
              ) : (
                workspace.requests.items.map((request) => (
                  <button
                    type="button"
                    key={request.id}
                    className={
                      selectedRequestId === request.id
                        ? 'forms-workspace__request is-selected'
                        : 'forms-workspace__request'
                    }
                    onClick={() => setSelectedRequestId(request.id)}
                  >
                    <span className={`forms-workspace__status is-${request.status}`}>
                      {statusLabel(request.status)}
                    </span>
                    <strong>{requestTitle(request)}</strong>
                    <small>{formatDate(request.submittedAt)}</small>
                  </button>
                ))
              )}
            </div>

            <div className="forms-workspace__request-detail">
              {detailLoading ? (
                <p className="forms-workspace__empty">Cargando detalle…</p>
              ) : detail ? (
                <>
                  <div className="forms-workspace__detail-heading">
                    <div>
                      <span className="forms-workspace__eyebrow">SOLICITUD</span>
                      <h2>{requestTitle(detail.request)}</h2>
                      <p>{formatDate(detail.request.submittedAt)}</p>
                    </div>
                    <span className={`forms-workspace__status is-${detail.request.status}`}>
                      {statusLabel(detail.request.status)}
                    </span>
                  </div>

                  <section className="forms-workspace__detail-section">
                    <h3>Respuestas</h3>
                    <dl className="forms-workspace__answers">
                      {detail.request.definitionSnapshot.fields.map((field) => (
                        <div key={field.id}>
                          <dt>{field.label}</dt>
                          <dd>{formatAnswer(detail.request.answers[field.id])}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <section className="forms-workspace__detail-section">
                    <h3>Estado</h3>
                    <div className="forms-workspace__status-controls">
                      <select
                        value={detail.request.status}
                        disabled={action === 'status'}
                        onChange={(event) =>
                          void changeStatus(event.target.value as SiteFormRequestStatus)
                        }
                      >
                        {REQUEST_STATUSES.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={statusReason}
                        maxLength={500}
                        placeholder="Motivo opcional del siguiente cambio"
                        onChange={(event) => setStatusReason(event.target.value)}
                      />
                    </div>
                    <ol className="forms-workspace__history">
                      {detail.history.map((entry) => (
                        <li key={entry.id}>
                          <span>{statusLabel(entry.toStatus)}</span>
                          <small>
                            {formatDate(entry.createdAt)}
                            {entry.changedBy ? ` · ${entry.changedBy}` : ''}
                          </small>
                          {entry.reason ? <p>{entry.reason}</p> : null}
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="forms-workspace__detail-section">
                    <h3>Notas internas</h3>
                    <div className="forms-workspace__notes">
                      {detail.notes.length === 0 ? (
                        <p className="forms-workspace__empty">Sin notas internas.</p>
                      ) : (
                        detail.notes.map((note) => (
                          <article key={note.id}>
                            <p>{note.body}</p>
                            <small>
                              {note.authorEmail} · {formatDate(note.createdAt)}
                            </small>
                          </article>
                        ))
                      )}
                    </div>
                    <form className="forms-workspace__note-form" onSubmit={addNote}>
                      <textarea
                        value={noteBody}
                        maxLength={4000}
                        placeholder="Agrega contexto privado para el equipo"
                        onChange={(event) => setNoteBody(event.target.value)}
                      />
                      <button type="submit" disabled={!noteBody.trim() || action === 'note'}>
                        {action === 'note' ? 'Guardando…' : 'Agregar nota'}
                      </button>
                    </form>
                  </section>

                  <details className="forms-workspace__internal">
                    <summary>Payload interno</summary>
                    <pre>{JSON.stringify(detail.request.internalPayload, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="forms-workspace__empty">Selecciona una solicitud.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="forms-workspace__configuration">
            <section className="forms-workspace__settings-card">
              <div className="forms-workspace__settings-heading">
                <div>
                  <span className="forms-workspace__eyebrow">CONTENIDO</span>
                  <h2>Encabezado y confirmación</h2>
                </div>
              </div>
              <label>
                Título
                <input
                  value={draft.title}
                  maxLength={200}
                  onChange={(event) => updateDefinition('title', event.target.value)}
                />
              </label>
              <label>
                Descripción
                <textarea
                  value={draft.description}
                  maxLength={1000}
                  onChange={(event) => updateDefinition('description', event.target.value)}
                />
              </label>
              <div className="forms-workspace__settings-grid">
                <label>
                  Texto del botón
                  <input
                    value={draft.submitLabel}
                    maxLength={80}
                    onChange={(event) => updateDefinition('submitLabel', event.target.value)}
                  />
                </label>
                <label>
                  Mensaje de éxito
                  <input
                    value={draft.successMessage}
                    maxLength={500}
                    onChange={(event) => updateDefinition('successMessage', event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="forms-workspace__settings-card">
              <div className="forms-workspace__settings-heading">
                <div>
                  <span className="forms-workspace__eyebrow">CAMPOS Y ORDEN</span>
                  <h2>Definición del formulario</h2>
                </div>
                <button type="button" onClick={() => addField()}>
                  + Agregar campo
                </button>
              </div>

              <div className="forms-workspace__field-editors">
                {draft.fields.map((field, index) => (
                  <article className="forms-workspace__field-editor" key={field.id}>
                    <div className="forms-workspace__field-order">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <button
                        type="button"
                        aria-label={`Subir ${field.label}`}
                        disabled={index === 0}
                        onClick={() => moveField(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${field.label}`}
                        disabled={index === draft.fields.length - 1}
                        onClick={() => moveField(index, 1)}
                      >
                        ↓
                      </button>
                    </div>
                    <div className="forms-workspace__field-body">
                      <div className="forms-workspace__settings-grid">
                        <label>
                          Etiqueta
                          <input
                            value={field.label}
                            maxLength={160}
                            onChange={(event) =>
                              updateField(field.id, { label: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Tipo
                          <select
                            value={field.type}
                            onChange={(event) =>
                              changeFieldType(field.id, event.target.value as SiteFormFieldType)
                            }
                          >
                            {FIELD_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {field.type !== 'checkbox' ? (
                        <label>
                          Placeholder
                          <input
                            value={field.placeholder ?? ''}
                            maxLength={240}
                            onChange={(event) =>
                              updateField(field.id, { placeholder: event.target.value })
                            }
                          />
                        </label>
                      ) : null}

                      <label>
                        Ayuda opcional
                        <input
                          value={field.helpText ?? ''}
                          maxLength={500}
                          onChange={(event) =>
                            updateField(field.id, { helpText: event.target.value })
                          }
                        />
                      </label>

                      {field.type === 'select' ? (
                        <label>
                          Opciones (una por línea: valor | etiqueta)
                          <textarea
                            value={serializeOptions(field)}
                            onChange={(event) =>
                              updateField(field.id, {
                                options: parseOptions(event.target.value),
                              })
                            }
                          />
                        </label>
                      ) : null}

                      {field.type !== 'checkbox' && field.type !== 'select' ? (
                        <div className="forms-workspace__settings-grid">
                          <label>
                            Longitud mínima
                            <input
                              type="number"
                              min={0}
                              value={field.minLength ?? ''}
                              onChange={(event) =>
                                updateField(field.id, {
                                  minLength: optionalNumber(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Longitud máxima
                            <input
                              type="number"
                              min={1}
                              max={4000}
                              value={field.maxLength ?? ''}
                              onChange={(event) =>
                                updateField(field.id, {
                                  maxLength: optionalNumber(event.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : null}

                      <div className="forms-workspace__field-footer">
                        <label className="forms-workspace__required">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              updateField(field.id, { required: event.target.checked })
                            }
                          />
                          Obligatorio
                        </label>
                        <code>{field.id}</code>
                        <button
                          type="button"
                          className="forms-workspace__remove"
                          disabled={draft.fields.length === 1}
                          onClick={() => removeField(field.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <footer className="forms-workspace__savebar">
              <div>
                <strong>{isDirty ? 'Hay cambios sin guardar' : 'Borrador sincronizado'}</strong>
                <span>Publicar reemplaza la definición pública con esta revisión exacta.</span>
              </div>
              <button
                type="button"
                className="is-secondary"
                disabled={!isDirty || action !== null}
                onClick={() => void saveDraft()}
              >
                {action === 'save' ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button type="button" disabled={action !== null} onClick={() => void publishDraft()}>
                {action === 'publish' ? 'Publicando…' : 'Publicar formulario'}
              </button>
            </footer>
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewField({ field }: { field: SiteFormField }) {
  const label = (
    <span>
      {field.label}
      {field.required ? <sup>*</sup> : null}
    </span>
  );

  if (field.type === 'textarea') {
    return (
      <label className="forms-workspace__preview-field">
        {label}
        <textarea placeholder={field.placeholder} disabled />
        {field.helpText ? <small>{field.helpText}</small> : null}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <label className="forms-workspace__preview-field">
        {label}
        <select disabled defaultValue="">
          <option value="">{field.placeholder || 'Selecciona una opción'}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.helpText ? <small>{field.helpText}</small> : null}
      </label>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label className="forms-workspace__preview-check">
        <input type="checkbox" disabled />
        <span>
          {field.label}
          {field.required ? <sup>*</sup> : null}
          {field.helpText ? <small>{field.helpText}</small> : null}
        </span>
      </label>
    );
  }
  return (
    <label className="forms-workspace__preview-field">
      {label}
      <input type={field.type} placeholder={field.placeholder} disabled />
      {field.helpText ? <small>{field.helpText}</small> : null}
    </label>
  );
}

function newField(type: SiteFormFieldType): SiteFormField {
  const base: SiteFormField = {
    id: crypto.randomUUID(),
    type,
    label: type === 'checkbox' ? 'Acepto los términos' : 'Nuevo campo',
    required: false,
  };
  return convertFieldType(base, type);
}

function convertFieldType(field: SiteFormField, type: SiteFormFieldType): SiteFormField {
  const { options: _options, minLength: _min, maxLength: _max, ...base } = field;
  if (type === 'select') {
    return {
      ...base,
      type,
      options: field.options?.length
        ? field.options
        : [
            { value: 'opcion-1', label: 'Opción 1' },
            { value: 'opcion-2', label: 'Opción 2' },
          ],
    };
  }
  if (type === 'checkbox') return { ...base, type };
  const maximum = type === 'email' ? 254 : type === 'tel' ? 30 : type === 'textarea' ? 2000 : 120;
  return {
    ...base,
    type,
    minLength: field.minLength,
    maxLength: Math.min(field.maxLength ?? maximum, maximum),
  };
}

function serializeOptions(field: SiteFormField): string {
  return (field.options ?? []).map((option) => `${option.value} | ${option.label}`).join('\n');
}

function parseOptions(value: string): SiteFormField['options'] {
  return value
    .split('\n')
    .map((line) => {
      const [rawValue, ...rawLabel] = line.split('|');
      const optionValue = rawValue?.trim() ?? '';
      const optionLabel = rawLabel.join('|').trim() || optionValue;
      return { value: optionValue, label: optionLabel };
    })
    .filter((option) => option.value.length > 0);
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requestTitle(request: Pick<SiteFormRequest, 'id' | 'answers'>): string {
  const preferred = request.answers.name;
  if (typeof preferred === 'string' && preferred.trim()) return preferred;
  const firstText = Object.values(request.answers).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return firstText ?? `Solicitud ${request.id.slice(0, 8)}`;
}

function formatAnswer(answer: string | boolean | undefined): string {
  if (typeof answer === 'boolean') return answer ? 'Sí' : 'No';
  return answer?.trim() || '—';
}

function statusLabel(status: SiteFormRequestStatus): string {
  return REQUEST_STATUSES.find((item) => item.value === status)?.label ?? status;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Ocurrió un error inesperado.';
}
