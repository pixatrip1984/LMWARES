import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CommercialOperation, CommercialScopeDraft } from '@starter/domain';
import { salesApi } from '../lib/sales-api';
import './SalesPage.css';

type Draft = {
  contactName: string;
  email: string;
  businessName: string;
  need: string;
  plan: 'starter' | 'pro';
  modules: string[];
  maintenancePreference: 'later' | 'none' | 'basic' | 'advanced';
};
const STORAGE_KEY = 'lmwares.sales.new-operation.v1';
const emptyDraft: Draft = {
  contactName: '',
  email: '',
  businessName: '',
  need: '',
  plan: 'starter',
  modules: ['landing', 'panel', 'quote'],
  maintenancePreference: 'later',
};
const MODULES = [
  { id: 'landing', name: 'Sitio web', detail: 'Presencia y contacto', base: true },
  { id: 'panel', name: 'Panel', detail: 'Operación privada', base: true },
  { id: 'quote', name: 'Cotizaciones', detail: 'Solicitudes directas' },
  { id: 'catalog', name: 'Catálogo', detail: 'Productos o servicios' },
  { id: 'galleries', name: 'Galerías', detail: 'Imagen y portafolio' },
  { id: 'blog', name: 'Blog', detail: 'Contenido editorial' },
  { id: 'events', name: 'Eventos', detail: 'Agenda administrable' },
  { id: 'docs', name: 'Documentos', detail: 'Biblioteca privada' },
];

export function SalesPage() {
  const [draft, setDraft] = useState<Draft>(() => readDraft());
  const [operations, setOperations] = useState<CommercialOperation[]>([]);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [scopeErrors, setScopeErrors] = useState<Record<string, string>>({});
  const [scopes, setScopes] = useState<Record<string, CommercialScopeDraft>>({});
  const [scopeSeconds, setScopeSeconds] = useState(0);
  useEffect(() => {
    setScopeSeconds(0);
    if (!generatingId) return;
    const timer = window.setInterval(() => setScopeSeconds(s => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generatingId]);
  const [hints, setHints] = useState<{ emailExists: boolean; businessExists: boolean } | null>(
    null,
  );
  const complements = draft.modules.filter((id) => id !== 'landing' && id !== 'panel').length;
  const canCreate = useMemo(
    () =>
      Boolean(
        draft.contactName.trim() &&
        draft.email.trim() &&
        draft.businessName.trim() &&
        draft.need.trim() &&
        (draft.plan === 'starter' ? complements >= 1 && complements <= 2 : complements >= 3),
      ),
    [draft, complements],
  );
  const load = async () => {
    const [me, result] = await Promise.all([salesApi.me(), salesApi.listOperations()]);
    setSellerName(me.seller.displayName);
    setOperations(result.operations);
  };
  useEffect(() => {
    void load().catch((cause) => setError(message(cause)));
  }, []);
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);
  const create = async () => {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const result = await salesApi.createOperation(
        {
          contact: { displayName: draft.contactName.trim(), email: draft.email.trim() },
          business: { tradeName: draft.businessName.trim() },
          requirementBrief: {
            businessName: draft.businessName.trim(),
            sellerNotes: draft.need.trim(),
            packageSelection: {
              plan: draft.plan,
              modules: draft.modules,
              maintenancePreference: draft.maintenancePreference,
            },
          },
        },
        crypto.randomUUID(),
      );
      setOperations((current) => [result.operation, ...current]);
      setDraft(emptyDraft);
      setHints(null);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  };
  const checkDuplicates = async () => {
    setError(null);
    try {
      setHints(
        (
          await salesApi.dedupHints({
            email: draft.email || undefined,
            businessName: draft.businessName || undefined,
          })
        ).hints,
      );
    } catch (cause) {
      setError(message(cause));
    }
  };
  const generateScope = async (operation: CommercialOperation) => {
    if (generatingId) return;
    setGeneratingId(operation.id);
    setScopeErrors(current => ({ ...current, [operation.id]: '' }));
    try {
      const result = await salesApi.generateScope(operation.id);
      setOperations((current) =>
        current.map((item) => (item.id === operation.id ? result.proposal.operation : item)),
      );
      setScopes(current => ({ ...current, [operation.id]: result.draft }));
    } catch (cause) {
      setScopeErrors(current => ({ ...current, [operation.id]: cause instanceof DOMException && cause.name === 'TimeoutError' ? 'La solicitud tardó demasiado. Puedes abrir el alcance si terminó de guardarse o reintentar; tu oportunidad sigue guardada.' : message(cause) }));
    } finally {
      setGeneratingId(null);
    }
  };
  const openScope = async (operation: CommercialOperation) => {
    setScopeErrors(current => ({ ...current, [operation.id]: '' }));
    try {
      const result = await salesApi.getScope(operation.id);
      setScopes(current => ({ ...current, [operation.id]: result.draft }));
    } catch (cause) { setScopeErrors(current => ({ ...current, [operation.id]: message(cause) })); }
  };
  const toggleModule = (id: string, base?: boolean) => {
    if (base) return;
    setDraft((current) => ({
      ...current,
      modules: current.modules.includes(id)
        ? current.modules.filter((item) => item !== id)
        : [...current.modules, id],
    }));
  };
  return (
    <main className="sales-shell">
      <section className="sales-hero">
        <div className="sales-orbit sales-orbit-a" />
        <div className="sales-orbit sales-orbit-b" />
        <div className="sales-hero-inner">
          <div className="sales-brand">
            <span>LM</span>
            <b>
              LMWARES <i>·</i> SALES
            </b>
          </div>
          <div className="sales-hero-copy">
            <p>ENCUENTRO COMERCIAL</p>
            <h1>
              Convierte la conversación
              <br />
              en un sitio que se puede ver.
            </h1>
            <span>{sellerName ? `Hola, ${sellerName}` : 'Preparando tu espacio de venta…'}</span>
          </div>
          <ol className="sales-steps">
            <li className="is-active">
              <b>01</b>
              <span>Conoce</span>
            </li>
            <li>
              <b>02</b>
              <span>Configura</span>
            </li>
            <li>
              <b>03</b>
              <span>Presenta</span>
            </li>
          </ol>
        </div>
      </section>
      <section className="sales-content">
        <div className="sales-intro">
          <div>
            <p className="sales-kicker">Nueva oportunidad</p>
            <h2>Construyámosla juntos.</h2>
            <p>
              Captura lo esencial mientras hablas con el cliente. El alcance se redacta después con
              las reglas reales de LMWares.
            </p>
          </div>
          <div className="sales-live">
            <i />
            <span>Borrador protegido en este dispositivo</span>
          </div>
        </div>
        {error ? <p className="sales-alert">{error}</p> : null}
        <section className="sales-workspace">
          <div className="sales-form-card">
            <Heading
              number="01"
              title="Quién es y qué necesita"
              copy="Lo esencial, sin convertir la visita en papeleo."
            />
            <div className="sales-fields">
              <Field label="Persona que decide">
                <input
                  value={draft.contactName}
                  onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                  placeholder="Nombre completo"
                />
              </Field>
              <Field label="Correo de verificación">
                <input
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="nombre@negocio.com"
                  type="email"
                />
              </Field>
              <Field label="Negocio">
                <input
                  value={draft.businessName}
                  onChange={(e) => setDraft({ ...draft, businessName: e.target.value })}
                  placeholder="Nombre comercial"
                />
              </Field>
              <Field label="Qué quiere lograr" full>
                <textarea
                  value={draft.need}
                  onChange={(e) => setDraft({ ...draft, need: e.target.value })}
                  placeholder="Ej. que lo encuentren, muestren sus servicios y reciban cotizaciones por WhatsApp…"
                  rows={4}
                />
              </Field>
            </div>
            <button
              className="sales-quiet-action"
              onClick={() => void checkDuplicates()}
              type="button"
            >
              ⌕ Revisar si ya existe
            </button>
            {hints ? (
              <p className="sales-hint">
                {hints.emailExists || hints.businessExists
                  ? 'Encontramos información relacionada. Protegemos su historial: confirma con el cliente antes de continuar.'
                  : 'No encontramos coincidencias básicas.'}
              </p>
            ) : null}
          </div>
          <aside className="sales-config-card">
            <Heading
              number="02"
              title="Lo que va a recibir"
              copy="La combinación define el alcance. Nada se promete fuera de aquí."
            />
            <div className="sales-plan-switch">
              <button
                className={draft.plan === 'starter' ? 'is-selected' : ''}
                onClick={() => setDraft({ ...draft, plan: 'starter' })}
                type="button"
              >
                <small>HASTA 2 COMPLEMENTOS</small>
                <b>Starter</b>
              </button>
              <button
                className={draft.plan === 'pro' ? 'is-selected' : ''}
                onClick={() => setDraft({ ...draft, plan: 'pro' })}
                type="button"
              >
                <small>3 O MÁS COMPLEMENTOS</small>
                <b>Pro</b>
              </button>
            </div>
            <div className="sales-module-grid">
              {MODULES.map((module) => (
                <button
                  aria-pressed={draft.modules.includes(module.id)}
                  className={`${draft.modules.includes(module.id) ? 'is-selected ' : ''}${module.base ? 'is-base' : ''}`}
                  disabled={module.base}
                  key={module.id}
                  onClick={() => toggleModule(module.id, module.base)}
                  type="button"
                >
                  <strong>{module.name}</strong>
                  <span>{module.base ? 'Incluido' : module.detail}</span>
                </button>
              ))}
            </div>
            <label className="sales-maintenance">
              <span>Mantenimiento</span>
              <select
                value={draft.maintenancePreference}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maintenancePreference: e.target.value as Draft['maintenancePreference'],
                  })
                }
              >
                <option value="later">Elegir después · $0 por ahora</option>
                <option value="none">Sin mantenimiento · $0</option>
                <option value="basic">Mantenimiento básico</option>
                <option value="advanced">Mantenimiento avanzado</option>
              </select>
            </label>
          </aside>
        </section>
        <section className="sales-ready">
          <div>
            <p>RESUMEN EN VIVO</p>
            <h3>
              {draft.plan === 'starter' ? 'Starter' : 'Pro'} <span>·</span> {draft.modules.length}{' '}
              capacidades
            </h3>
            <small>
              {draft.maintenancePreference === 'later' || draft.maintenancePreference === 'none'
                ? 'Mantenimiento: $0 hasta que el cliente elija un plan.'
                : 'Mantenimiento seleccionado; se incluirá en la propuesta.'}
            </small>
          </div>
          <button disabled={!canCreate || saving} onClick={() => void create()} type="button">
            {saving ? (
              'Guardando…'
            ) : (
              <>
                Guardar oportunidad <span>→</span>
              </>
            )}
          </button>
        </section>
        <section className="sales-operations">
          <div className="sales-operations-head">
            <div>
              <p className="sales-kicker">Seguimiento</p>
              <h2>Mis oportunidades</h2>
            </div>
            <span>{operations.length} activas</span>
          </div>
          <div className="sales-operation-list">
            {operations.length ? (
              operations.map((operation) => (
                <article key={operation.id}>
                  <div className="sales-operation-mark">{operation.publicReference.slice(-2)}</div>
                  <div>
                    <small>{operation.status.replaceAll('_', ' ')}</small>
                    <h3>{operation.publicReference}</h3>
                    <p>Actualizada {new Date(operation.updatedAt).toLocaleString()}</p>
                  </div>
                  {['draft', 'needs_scope'].includes(operation.status) ? (
                    <button
                      disabled={generatingId !== null}
                      onClick={() => void generateScope(operation)}
                      type="button"
                    >
                      {generatingId === operation.id ? 'Creando…' : 'Preparar alcance'}{' '}
                      <span>→</span>
                    </button>
                  ) : (
                    operation.currentProposalId ? <button type="button" onClick={() => void openScope(operation)}>Ver alcance</button> : <span className="sales-ready-tag">{operation.status === 'accepted' ? 'Aceptada' : 'En seguimiento'}</span>
                  )}
                  {generatingId === operation.id && <div className="sales-scope-feedback" role="status">Preparando la presentación y comprobando el paquete… {scopeSeconds}s. Al terminar aparecerá aquí para tu revisión.</div>}
                  {scopeErrors[operation.id] && <div className="sales-scope-feedback is-error" role="alert">{scopeErrors[operation.id]} <button type="button" onClick={() => void openScope(operation)}>Comprobar si se guardó</button></div>}
                  {scopes[operation.id] && <section className="sales-scope-preview" aria-label="Alcance para revisión">
                    <p className="sales-kicker">Borrador de propuesta · pendiente de revisión</p>
                    <h4>{scopes[operation.id]?.demoBrief.headline}</h4>
                    <p>{scopes[operation.id]?.scopeSummary}</p>
                    <h5>Qué incluye la implementación</h5><p>{scopes[operation.id]?.implementationDescription}</p>
                    <h5>Mantenimiento</h5><p>{scopes[operation.id]?.recurringDescription}</p>
                    <h5>Recorrido de la demo pública</h5><p>{scopes[operation.id]?.demoBrief.subheadline}</p>
                    <ol>{scopes[operation.id]?.demoBrief.sections.map(section => <li key={section}>{section}</li>)}</ol>
                    <p>Preparar este alcance no lo envía al cliente ni inicia una demo.</p>
                  </section>}
                </article>
              ))
            ) : (
              <div className="sales-empty">
                <b>Tu primera oportunidad aparecerá aquí.</b>
                <span>Empieza con el cliente que tienes enfrente.</span>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
function Heading({ number, title, copy }: { number: string; title: string; copy: string }) {
  return (
    <div className="sales-section-heading">
      <span>{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
    </div>
  );
}
function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? 'is-full' : ''}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function readDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyDraft, ...(JSON.parse(raw) as Partial<Draft>) } : emptyDraft;
  } catch {
    return emptyDraft;
  }
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
