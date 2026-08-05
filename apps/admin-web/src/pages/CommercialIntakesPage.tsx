import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppError,
  type BillingOrder,
  type LmwaresProject,
  type MaintenanceSubscription,
  PACKAGE_MODULE_IDS,
  PACKAGE_INTAKE_STATUSES,
  type CommercialOffer,
  type PackageIntake,
  type PackageIntakeStatus,
  type StarterWorkOrder,
} from '@starter/domain';
import { Button, Card, CardBody, EmptyState, ErrorBanner, PageHeader, Spinner, Textarea } from '@starter/ui';
import { api } from '../lib/api';

const STATUS_LABELS: Record<PackageIntakeStatus, string> = {
  submitted: 'Pendiente',
  scope_review: 'En revisión',
  offer_ready: 'Oferta lista',
  declined: 'No aprobada',
  converted: 'Convertida',
};

export function CommercialIntakesPage() {
  const [items, setItems] = useState<PackageIntake[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<PackageIntakeStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [offers, setOffers] = useState<CommercialOffer[]>([]);
  const [billingOrders, setBillingOrders] = useState<BillingOrder[]>([]);
  const [workOrder, setWorkOrder] = useState<StarterWorkOrder | null>(null);
  const [maintenanceSubscription, setMaintenanceSubscription] = useState<MaintenanceSubscription | null>(null);
  const [projects, setProjects] = useState<LmwaresProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [offerForm, setOfferForm] = useState({
    implementationPesos: '',
    monthlyPesos: '',
    scopeSummary: '',
    implementationDescription: '',
    recurringDescription: '',
    modules: [] as PackageIntake['modules'],
    marketing: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.listCommercialPackageIntakes({ status: status || undefined, limit: 100 });
    setItems(result.intakes);
    setSelectedId((current) =>
      current && result.intakes.some((item) => item.id === current)
        ? current
        : result.intakes[0]?.id ?? null,
    );
  }, [status]);

  useEffect(() => {
    setItems(null);
    setError(null);
    load().catch((err) => {
      setItems([]);
      setError(err instanceof AppError ? err.message : 'No se pudo cargar la bandeja.');
    });
  }, [load]);

  const selected = useMemo(
    () => items?.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    setNotes(selected?.reviewNotes ?? '');
    if (!selected) {
      setOffers([]);
      setBillingOrders([]);
      setWorkOrder(null);
      setMaintenanceSubscription(null);
      return;
    }
    setOfferForm({
      implementationPesos: String(selected.estimatedImplementationCents / 100),
      monthlyPesos: String(selected.estimatedMonthlyCents / 100),
      scopeSummary: `Implementación ${selected.plan} con ${selected.modules.join(', ')}.`,
      implementationDescription: 'Diseño, construcción, validación y publicación inicial del alcance acordado.',
      recurringDescription: 'Alojamiento administrado, mantenimiento base y soporte del servicio publicado.',
      modules: selected.modules,
      marketing: false,
    });
    Promise.all([
      api.getCommercialPackageIntake(selected.id),
      selected.status === 'converted' ? api.listLmwaresProjects() : Promise.resolve(null),
    ])
      .then(([result, registry]) => {
        setOffers(result.offers);
        setBillingOrders(result.billingOrders);
        setWorkOrder(result.workOrder);
        setMaintenanceSubscription(result.maintenanceSubscription);
        setProjects(registry?.projects ?? []);
        setProjectId(result.workOrder?.projectId ?? '');
        setPublicUrl(result.workOrder?.publishedUrl ?? '');
        const latestOffer = result.offers[0];
        if (latestOffer) {
          setOfferForm({
            implementationPesos: String(latestOffer.implementationAmountCents / 100),
            monthlyPesos: String(latestOffer.monthlyAmountCents / 100),
            scopeSummary: latestOffer.scopeSummary,
            implementationDescription: latestOffer.implementationDescription,
            recurringDescription: latestOffer.recurringDescription,
            modules: latestOffer.modules,
            marketing: false,
          });
        }
      })
      .catch(() => {
        setOffers([]);
        setBillingOrders([]);
        setWorkOrder(null);
        setMaintenanceSubscription(null);
      });
  }, [selected?.id, selected?.reviewNotes, selected?.status]);

  async function review(nextStatus: 'scope_review' | 'declined') {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.reviewCommercialPackageIntake(selected.id, {
        status: nextStatus,
        notes: notes.trim() || null,
      });
      setItems((current) =>
        current?.map((item) => (item.id === result.intake.id ? result.intake : item)) ?? [],
      );
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'No se pudo guardar la revisión.');
    } finally {
      setSaving(false);
    }
  }

  async function assignProject() {
    if (!selected || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.assignStarterWorkOrder(selected.id, projectId);
      setWorkOrder(result.workOrder);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'No se pudo enlazar el proyecto.');
    } finally {
      setSaving(false);
    }
  }

  async function changeWorkStatus(
    next: 'in_build' | 'client_review' | 'ready_to_publish' | 'canceled',
  ) {
    if (!selected || !workOrder) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateStarterWorkOrderStatus(selected.id, next);
      setWorkOrder(result.workOrder);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'No se pudo avanzar la orden de trabajo.');
    } finally {
      setSaving(false);
    }
  }

  async function publishWorkOrder() {
    if (!selected || !publicUrl) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.publishStarterWorkOrder(selected.id, publicUrl);
      setWorkOrder(result.workOrder);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'No se pudo abrir la compuerta de publicación.');
    } finally {
      setSaving(false);
    }
  }

  async function issueOffer() {
    if (!selected) return;
    const implementationAmountCents = pesosToCents(offerForm.implementationPesos);
    const monthlyAmountCents = pesosToCents(offerForm.monthlyPesos, true);
    if (implementationAmountCents == null || monthlyAmountCents == null) {
      setError('Revisa los importes de implementación y mensualidad.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.issueCommercialOffer(selected.id, {
        plan: selected.plan,
        modules: offerForm.modules,
        marketing: false,
        implementationAmountCents,
        monthlyAmountCents,
        scopeSummary: offerForm.scopeSummary,
        implementationDescription: offerForm.implementationDescription,
        recurringDescription: offerForm.recurringDescription,
        validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      });
      setOffers((current) => [result.offer, ...current.map((offer) =>
        offer.status === 'issued' ? { ...offer, status: 'superseded' as const } : offer
      )]);
      await load();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'No se pudo emitir la oferta.');
    } finally {
      setSaving(false);
    }
  }

  const phase1Order = billingOrders.find((order) => order.phase === 1) ?? null;

  async function reopenImplementationPayment() {
    if (!selected || !phase1Order) return;
    if (!window.confirm('Se cancelará la orden pendiente y la oferta aceptada volverá a revisión. No se puede deshacer.')) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.reopenExpiredImplementationPayment(selected.id);
      setItems((current) =>
        current?.map((item) => (item.id === result.intake.id ? result.intake : item)) ?? [],
      );
      setOffers(result.offers);
      setBillingOrders((current) =>
        current.map((order) => (order.id === result.billingOrder.id ? result.billingOrder : order)),
      );
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'No se pudo reabrir la oferta.');
    } finally {
      setSaving(false);
    }
  }

  function toggleOfferModule(module: PackageIntake['modules'][number]) {
    if (module === 'landing' || module === 'panel') return;
    setOfferForm((current) => ({
      ...current,
      modules: current.modules.includes(module)
        ? current.modules.filter((item) => item !== module)
        : [...current.modules, module],
    }));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paquetes por revisar"
        actions={
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PackageIntakeStatus | '')}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {PACKAGE_INTAKE_STATUSES.map((item) => (
              <option key={item} value={item}>{STATUS_LABELS[item]}</option>
            ))}
          </select>
        }
      />
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No hay solicitudes comerciales" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.4fr)]">
          <Card>
            <ul className="divide-y divide-surface-border">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full px-5 py-4 text-left ${item.id === selectedId ? 'bg-brand-50' : 'hover:bg-surface-muted'}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-gray-900">{item.plan}</span>
                      <span className="text-xs font-medium text-brand-700">{STATUS_LABELS[item.status]}</span>
                    </span>
                    <span className="mt-1 block text-sm text-gray-500">
                      {money(item.estimatedImplementationCents)} + {money(item.estimatedMonthlyCents)}/mes
                    </span>
                    <span className="mt-1 block text-xs text-gray-400">{formatDate(item.submittedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? (
            <Card>
              <CardBody>
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{STATUS_LABELS[selected.status]}</p>
                    <h2 className="mt-1 text-2xl font-bold text-gray-900">Paquete {selected.plan}</h2>
                    <p className="mt-1 text-sm text-gray-500">Referencia {selected.id}</p>
                  </div>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <Info label="Implementación estimada" value={money(selected.estimatedImplementationCents)} />
                    <Info label="Mantenimiento opcional estimado" value={`Desde ${money(selected.estimatedMonthlyCents)}/mes`} />
                    <Info label="Inicio de mensualidad" value="Al publicar el proyecto" />
                    <Info label="AstraMuses" value={selected.marketing ? 'Registro legado' : 'Próximamente'} />
                  </dl>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Módulos solicitados</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selected.modules.map((module) => (
                        <span key={module} className="rounded-full bg-surface-muted px-3 py-1 text-sm text-gray-700">{module}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="commercial-review-notes" className="mb-2 block text-sm font-medium text-gray-700">Notas internas de alcance</label>
                    <Textarea
                      id="commercial-review-notes"
                      rows={5}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      disabled={selected.status === 'declined' || selected.status === 'converted'}
                    />
                  </div>
                  {selected.status === 'submitted' || selected.status === 'scope_review' ? (
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => review('scope_review')} disabled={saving}>
                        {saving ? 'Guardando…' : selected.status === 'submitted' ? 'Tomar revisión' : 'Guardar revisión'}
                      </Button>
                      <Button variant="secondary" onClick={() => review('declined')} disabled={saving}>
                        No aprobar
                      </Button>
                    </div>
                  ) : null}
                  {selected.status === 'scope_review' || selected.status === 'offer_ready' ? (
                    <section className="space-y-4 border-t border-surface-border pt-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Oferta versionada</p>
                        <h3 className="mt-1 text-xl font-bold text-gray-900">
                          {offers.some((offer) => offer.status === 'issued') ? 'Emitir una revisión' : 'Preparar oferta final'}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">Vigencia automática de 15 días. Usa MXN $0 si el cliente contrata únicamente la implementación.</p>
                      </div>
                      {offers.length ? (
                        <div className="space-y-2">
                          {offers.map((offer) => (
                            <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm">
                              <span>v{offer.version} · {money(offer.implementationAmountCents)} + {money(offer.monthlyAmountCents)}/mes</span>
                              <b className="text-brand-700">{offer.status}</b>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {offers.some((offer) => offer.status === 'accepted') && phase1Order && phase1Order.status !== 'paid' ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          <p className="font-semibold">Cobro de implementación pendiente</p>
                          <p className="mt-1">
                            Si el checkout venció o el cliente necesita otro importe, cancela esta orden para emitir una nueva versión.
                          </p>
                          <Button className="mt-3" variant="secondary" onClick={reopenImplementationPayment} disabled={saving}>
                            {saving ? 'Reabriendo…' : 'Cancelar cobro y reabrir oferta'}
                          </Button>
                        </div>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <OfferInput label="Implementación (MXN)" value={offerForm.implementationPesos} onChange={(value) => setOfferForm((current) => ({ ...current, implementationPesos: value }))} />
                        <OfferInput label="Mantenimiento al publicar (MXN, 0 = no contratado)" value={offerForm.monthlyPesos} onChange={(value) => setOfferForm((current) => ({ ...current, monthlyPesos: value }))} />
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium text-gray-700">Módulos finales</p>
                        <div className="flex flex-wrap gap-2">
                          {PACKAGE_MODULE_IDS.map((module) => (
                            <label key={module} className="flex items-center gap-2 rounded-full border border-surface-border px-3 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={offerForm.modules.includes(module)}
                                disabled={module === 'landing' || module === 'panel'}
                                onChange={() => toggleOfferModule(module)}
                              />
                              {module}
                            </label>
                          ))}
                        </div>
                      </div>
                      <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                        AstraMuses está anunciado como Próximamente y no puede incluirse ni cobrarse en esta oferta.
                      </p>
                      <OfferText label="Resumen de alcance" value={offerForm.scopeSummary} onChange={(value) => setOfferForm((current) => ({ ...current, scopeSummary: value }))} />
                      <OfferText label="Qué cubre la implementación" value={offerForm.implementationDescription} onChange={(value) => setOfferForm((current) => ({ ...current, implementationDescription: value }))} />
                      <OfferText label="Qué cubre la mensualidad" value={offerForm.recurringDescription} onChange={(value) => setOfferForm((current) => ({ ...current, recurringDescription: value }))} />
                      <Button onClick={issueOffer} disabled={saving || offers.some((offer) => offer.status === 'accepted')}>
                        {saving ? 'Emitiendo…' : offers.some((offer) => offer.status === 'issued') ? 'Emitir nueva versión' : 'Emitir oferta'}
                      </Button>
                    </section>
                  ) : null}
                  {selected.status === 'converted' ? (
                    <section className="space-y-4 border-t border-surface-border pt-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Implementación pagada</p>
                        <h3 className="mt-1 text-xl font-bold text-gray-900">Orden de trabajo Starter</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          El proyecto se enlaza conscientemente después de crearlo o sincronizarlo en Oracle.
                        </p>
                      </div>
                      <dl className="grid gap-4 text-sm sm:grid-cols-2">
                        <Info
                          label="Fases de pago"
                          value={
                            billingOrders.length
                              ? `${billingOrders.filter((order) => order.status === 'paid').length}/${billingOrders.length} pagadas · ${billingOrders
                                  .slice()
                                  .sort((a, b) => a.phase - b.phase)
                                  .map((order) => `F${order.phase}:${order.status === 'paid' ? money(order.amountCents) : order.status}`)
                                  .join(' · ')}`
                              : 'Sin orden'
                          }
                        />
                        <Info label="Trabajo" value={workOrder ? workOrderStatusLabel(workOrder.status) : 'Preparando orden'} />
                        <Info label="Proyecto Oracle" value={workOrder?.projectId ?? 'Sin enlazar'} />
                        <Info label="Asignado por" value={workOrder?.assignedBy ?? 'Pendiente'} />
                        <Info
                          label="Mensualidad"
                          value={offers.find((offer) => offer.status === 'accepted')?.monthlyAmountCents === 0
                            ? 'No contratada · pago único'
                            : maintenanceSubscription
                              ? subscriptionStatusLabel(maintenanceSubscription.status)
                              : 'Sin autorizar'}
                        />
                        <Info label="URL pública" value={workOrder?.publishedUrl ?? 'Sin publicar'} />
                      </dl>
                      {workOrder && !workOrder.projectId ? (
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <select
                            aria-label="Proyecto Oracle"
                            className="rounded-lg border border-surface-border px-3 py-2 text-sm"
                            value={projectId}
                            onChange={(event) => setProjectId(event.target.value)}
                          >
                            <option value="">Selecciona un proyecto sincronizado</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>{project.name} · {project.id}</option>
                            ))}
                          </select>
                          <Button onClick={assignProject} disabled={saving || !projectId}>Enlazar proyecto</Button>
                        </div>
                      ) : null}
                      {workOrder?.projectId ? (
                        <div className="flex flex-wrap gap-3">
                          {workOrder.status === 'in_build' ? <Button onClick={() => changeWorkStatus('client_review')} disabled={saving}>Enviar a revisión del cliente</Button> : null}
                          {workOrder.status === 'client_review' ? (
                            <>
                              <Button variant="secondary" onClick={() => changeWorkStatus('in_build')} disabled={saving}>Volver a construcción</Button>
                              <Button onClick={() => changeWorkStatus('ready_to_publish')} disabled={saving}>Lista para publicar</Button>
                            </>
                          ) : null}
                          {workOrder.status === 'ready_to_publish' ? (
                            <>
                              <Button variant="secondary" onClick={() => changeWorkStatus('client_review')} disabled={saving}>Volver a revisión</Button>
                              {offers.find((offer) => offer.status === 'accepted')?.monthlyAmountCents === 0
                              || maintenanceSubscription?.status === 'active' ? (
                                <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                                  <input
                                    aria-label="URL pública inicial"
                                    className="rounded-lg border border-surface-border px-3 py-2 text-sm"
                                    placeholder="https://cliente.lmwares.com"
                                    value={publicUrl}
                                    onChange={(event) => setPublicUrl(event.target.value)}
                                  />
                                  <Button onClick={publishWorkOrder} disabled={saving || !publicUrl}>Confirmar publicación</Button>
                                </div>
                              ) : (
                                <span className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Publicación bloqueada hasta autorizar la suscripción contratada.</span>
                              )}
                            </>
                          ) : null}
                          {workOrder.status === 'live' && workOrder.publishedUrl ? (
                            <a className="text-sm font-semibold text-blue-700" href={workOrder.publishedUrl} rel="noreferrer" target="_blank">Abrir sitio publicado ↗</a>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function OfferInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="text-sm font-medium text-gray-700">
      {label}
      <input className="mt-2 w-full rounded-lg border border-surface-border px-3 py-2" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function OfferText({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <Textarea className="mt-2" rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function pesosToCents(value: string, allowZero = false): number | null {
  const amount = Number(value.replace(/,/g, '').trim());
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : 1)) return null;
  return Math.round(amount * 100);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-1 font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function money(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function workOrderStatusLabel(status: StarterWorkOrder['status']): string {
  const labels: Record<StarterWorkOrder['status'], string> = {
    awaiting_provisioning: 'Esperando proyecto',
    in_build: 'En construcción',
    client_review: 'En revisión del cliente',
    ready_to_publish: 'Lista para suscripción',
    live: 'Publicada',
    canceled: 'Cancelada',
  };
  return labels[status];
}

function subscriptionStatusLabel(status: MaintenanceSubscription['status']): string {
  const labels: Record<MaintenanceSubscription['status'], string> = {
    creating: 'Preparando',
    creation_failed: 'Falló la creación',
    pending_authorization: 'Pendiente de autorización',
    active: 'Activa',
    payment_attention: 'Requiere atención',
    paused: 'Pausada',
    canceled: 'Cancelada',
    disputed: 'En disputa',
  };
  return labels[status];
}
