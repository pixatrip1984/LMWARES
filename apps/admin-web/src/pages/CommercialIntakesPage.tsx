import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  type StarterClientProject,
  type StarterWorkOrder,
  type CommercialDemoLifecycle,
  type CommercialDemoPhase,
  type CommercialAgentJob,
} from '@starter/domain';
import { Button, Card, CardBody, EmptyState, ErrorBanner, PageHeader, Spinner, Textarea } from '@starter/ui';
import { api } from '../lib/api';
import {
  buildStarterPublicationBlockers,
  isValidStarterPublicationUrl,
} from '../lib/commercial-flow';

const STATUS_LABELS: Record<PackageIntakeStatus, string> = {
  submitted: 'Pendiente',
  scope_review: 'En revisión',
  offer_ready: 'Oferta lista',
  declined: 'No aprobada',
  converted: 'Convertida',
};

export function CommercialIntakesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedIntakeId = searchParams.get('intakeId')?.trim() || null;
  const [items, setItems] = useState<PackageIntake[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<PackageIntakeStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [offers, setOffers] = useState<CommercialOffer[]>([]);
  const [billingOrders, setBillingOrders] = useState<BillingOrder[]>([]);
  const [clientProject, setClientProject] = useState<StarterClientProject | null>(null);
  const [workOrder, setWorkOrder] = useState<StarterWorkOrder | null>(null);
  const [maintenanceSubscription, setMaintenanceSubscription] = useState<MaintenanceSubscription | null>(null);
  const [lifecycle, setLifecycle] = useState<CommercialDemoLifecycle | null>(null);
  const [demoPhases, setDemoPhases] = useState<CommercialDemoPhase[]>([]);
  const [agentJobs, setAgentJobs] = useState<CommercialAgentJob[]>([]);
  const [demoHtml, setDemoHtml] = useState('');
  const [phaseEvidence, setPhaseEvidence] = useState('');
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
  const [activeAction, setActiveAction] = useState<
    'review' | 'assign' | 'status' | 'publish' | 'offer' | 'reopen' | 'test_paid' | 'demo' | 'phase' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.listCommercialPackageIntakes({ status: status || undefined, limit: 100 });
    setItems(result.intakes);
    setSelectedId((current) =>
      requestedIntakeId && result.intakes.some((item) => item.id === requestedIntakeId)
        ? requestedIntakeId
        : current && result.intakes.some((item) => item.id === current)
        ? current
        : result.intakes[0]?.id ?? null,
    );
  }, [requestedIntakeId, status]);

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
  const acceptedOffer = useMemo(
    () => offers.find((offer) => offer.status === 'accepted') ?? null,
    [offers],
  );
  const publicationBlockers = useMemo(
    () =>
      buildStarterPublicationBlockers({
        acceptedOffer,
        billingOrders,
        workOrder,
        maintenanceSubscription,
        publicUrl,
      }),
    [acceptedOffer, billingOrders, maintenanceSubscription, publicUrl, workOrder],
  );
  const publicationReady = workOrder?.status === 'live' || publicationBlockers.length === 0;
  const phaseOrders = useMemo(
    () =>
      ([1, 2, 3, 4] as const).map((phase) => ({
        phase,
        order: billingOrders.find((order) => order.phase === phase) ?? null,
      })),
    [billingOrders],
  );

  useEffect(() => {
    if (!selectedId) {
      if (!searchParams.get('intakeId')) return;
      const next = new URLSearchParams(searchParams);
      next.delete('intakeId');
      setSearchParams(next, { replace: true });
      return;
    }
    const currentIntakeId = searchParams.get('intakeId')?.trim() || null;
    if (currentIntakeId === selectedId) return;
    const next = new URLSearchParams(searchParams);
    next.set('intakeId', selectedId);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedId, setSearchParams]);

  useEffect(() => {
    setNotes(selected?.reviewNotes ?? '');
    setActionError(null);
    if (!selected) {
      setOffers([]);
      setBillingOrders([]);
      setClientProject(null);
      setWorkOrder(null);
      setMaintenanceSubscription(null);
      setLifecycle(null);
      setDemoPhases([]);
      setAgentJobs([]);
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
        setClientProject(result.clientProject);
        setWorkOrder(result.workOrder);
        setMaintenanceSubscription(result.maintenanceSubscription);
        setLifecycle(result.lifecycle);
        setDemoPhases(result.demoPhases);
        setAgentJobs(result.agentJobs);
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
        setClientProject(null);
        setWorkOrder(null);
        setMaintenanceSubscription(null);
        setLifecycle(null);
        setDemoPhases([]);
        setAgentJobs([]);
      });
  }, [selected?.id, selected?.reviewNotes, selected?.status]);

  useEffect(() => {
    if (!selected?.id) return;

    let disposed = false;
    const refreshOperationalState = async () => {
      try {
        const result = await api.getCommercialPackageIntake(selected.id);
        if (disposed) return;
        setLifecycle(result.lifecycle);
        setDemoPhases(result.demoPhases);
        setAgentJobs(result.agentJobs);
        setWorkOrder(result.workOrder);
      } catch {
        // Keep the last known state. The regular page load still exposes hard failures.
      }
    };

    const timer = window.setInterval(() => {
      void refreshOperationalState();
    }, 10_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [selected?.id]);

  async function publishDemo() {
    if (!selected || !demoHtml.trim()) return;
    setActiveAction('demo'); setActionError(null);
    try { const result = await api.publishCommercialDemo(selected.id, demoHtml); setLifecycle(result.lifecycle); }
    catch (err) { setActionError(err instanceof AppError ? err.message : 'No se pudo publicar la demo.'); }
    finally { setActiveAction(null); }
  }
  async function completePhaseZero() {
    if (!selected || !phaseEvidence.trim()) return;
    setActiveAction('phase'); setActionError(null);
    try { const result = await api.completeCommercialPhaseZero(selected.id, phaseEvidence); setLifecycle(result.lifecycle); setBillingOrders(result.billingOrders); await load(); }
    catch (err) { setActionError(err instanceof AppError ? err.message : 'No se pudo terminar la fase 0.'); }
    finally { setActiveAction(null); }
  }
  async function approveGeneratedDemo() {
    if (!selected) return;
    setActiveAction('demo'); setActionError(null);
    try { const result = await api.approveGeneratedCommercialDemo(selected.id); setLifecycle(result.lifecycle); await load(); }
    catch (err) { setActionError(err instanceof AppError ? err.message : 'No se pudo aprobar la demo generada.'); }
    finally { setActiveAction(null); }
  }
  async function approveGeneratedRelease(releaseId: string) {
    if (!selected) return;
    setActiveAction('demo'); setActionError(null);
    try { const result = await api.approveCommercialDemoRelease(selected.id, releaseId); setLifecycle(result.lifecycle); await load(); }
    catch (err) { setActionError(err instanceof AppError ? err.message : 'No se pudo aprobar el release de la demo.'); }
    finally { setActiveAction(null); }
  }
  async function advanceDemoPhase(phase: 1 | 2 | 3 | 4, complete: boolean) {
    if (!selected || (complete && !phaseEvidence.trim())) return;
    setActiveAction('phase'); setActionError(null);
    try {
      const result = complete ? await api.completeCommercialPhase(selected.id, phase, phaseEvidence) : await api.startCommercialPhase(selected.id, phase);
      setDemoPhases((current) => current.map((item) => item.phase === phase ? result.phase : item));
    } catch (err) { setActionError(err instanceof AppError ? err.message : 'No se pudo actualizar la fase.'); }
    finally { setActiveAction(null); }
  }

  async function review(nextStatus: 'scope_review' | 'declined') {
    if (!selected) return;
    setActiveAction('review');
    setError(null);
    setActionError(null);
    try {
      const result = await api.reviewCommercialPackageIntake(selected.id, {
        status: nextStatus,
        notes: notes.trim() || null,
      });
      setItems((current) =>
        current?.map((item) => (item.id === result.intake.id ? result.intake : item)) ?? [],
      );
    } catch (err) {
      setActionError(err instanceof AppError ? err.message : 'No se pudo guardar la revisión.');
    } finally {
      setActiveAction(null);
    }
  }

  async function assignProject() {
    if (!selected || !projectId) return;
    setActiveAction('assign');
    setError(null);
    setActionError(null);
    try {
      const result = await api.assignStarterWorkOrder(selected.id, projectId);
      setWorkOrder(result.workOrder);
    } catch (err) {
      setActionError(err instanceof AppError ? err.message : 'No se pudo enlazar el proyecto.');
    } finally {
      setActiveAction(null);
    }
  }

  async function changeWorkStatus(
    next: 'in_build' | 'client_review' | 'ready_to_publish' | 'canceled',
  ) {
    if (!selected || !workOrder) return;
    setActiveAction('status');
    setError(null);
    setActionError(null);
    try {
      const result = await api.updateStarterWorkOrderStatus(selected.id, next);
      setWorkOrder(result.workOrder);
    } catch (err) {
      setActionError(
        err instanceof AppError ? err.message : 'No se pudo avanzar la orden de trabajo.',
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function publishWorkOrder() {
    if (!selected || !publicUrl) return;
    setActiveAction('publish');
    setError(null);
    setActionError(null);
    try {
      const result = await api.publishStarterWorkOrder(selected.id, publicUrl);
      setWorkOrder(result.workOrder);
    } catch (err) {
      setActionError(
        err instanceof AppError
          ? err.message
          : 'No se pudo abrir la compuerta de publicación.',
      );
    } finally {
      setActiveAction(null);
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
    setActiveAction('offer');
    setError(null);
    setActionError(null);
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
      setActionError(err instanceof AppError ? err.message : 'No se pudo emitir la oferta.');
    } finally {
      setActiveAction(null);
    }
  }

  const phase1Order = billingOrders.find((order) => order.phase === 1) ?? null;
  const localTestFixturesAvailable =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  async function reopenImplementationPayment() {
    if (!selected || !phase1Order) return;
    if (!window.confirm('Se cancelará la orden pendiente y la oferta aceptada volverá a revisión. No se puede deshacer.')) {
      return;
    }
    setActiveAction('reopen');
    setError(null);
    setActionError(null);
    try {
      const result = await api.reopenExpiredImplementationPayment(selected.id);
      setItems((current) =>
        current?.map((item) => (item.id === result.intake.id ? result.intake : item)) ?? [],
      );
      setOffers(result.offers);
      setBillingOrders(result.billingOrders);
    } catch (err) {
      setActionError(err instanceof AppError ? err.message : 'No se pudo reabrir la oferta.');
    } finally {
      setActiveAction(null);
    }
  }

  async function markImplementationPhasesTestPaid() {
    if (!selected) return;
    if (!window.confirm('Esto marca las cuatro fases como pagadas sólo en el entorno local. No llama a Mercado Pago.')) {
      return;
    }
    setActiveAction('test_paid');
    setActionError(null);
    try {
      const result = await api.markImplementationPhasesTestPaid(selected.id);
      setBillingOrders(result.billingOrders);
      setWorkOrder(result.workOrder);
      setClientProject(result.clientProject);
      await load();
    } catch (err) {
      setActionError(err instanceof AppError ? err.message : 'No se pudo crear el fixture de pago.');
    } finally {
      setActiveAction(null);
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
        <EmptyState
          title={status ? 'No hay paquetes con ese estado' : 'No hay solicitudes comerciales'}
          hint="Los paquetes Starter/Pro aparecen aquí al pulsar «Enviar para revisión» en contratar.lmwares.com. La bandeja Solicitudes es solo Free/contacto."
        />
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
                      <span className="font-semibold text-gray-900">
                        {item.brief?.businessName || item.brief?.contactName || `Paquete ${item.plan}`}
                      </span>
                      <span className="text-xs font-medium text-brand-700">{STATUS_LABELS[item.status]}</span>
                    </span>
                    <span className="mt-1 block font-mono text-xs text-gray-500">
                      ID: {item.id.slice(0, 8)}… · Plan {item.plan.toUpperCase()}
                    </span>
                    <span className="mt-1 block text-sm text-gray-600">
                      {money(item.estimatedImplementationCents)} + {money(item.estimatedMonthlyCents)}/mes
                    </span>
                    <span className="mt-1 block text-xs text-gray-400">📅 {formatDate(item.submittedAt)}</span>
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
                    <Info label="ID de solicitud" value={selected.id} />
                    <Info label="Fecha y Hora de envío" value={formatDate(selected.submittedAt)} />
                    <Info label="Implementación estimada" value={money(selected.estimatedImplementationCents)} />
                    {selected.discountCode ? (
                      <Info
                        label="Descuento aplicado"
                        value={`${selected.discountCode} (−${selected.discountPercent}%)`}
                      />
                    ) : null}
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
                  <div className="rounded-xl border border-surface-border bg-surface-muted/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contacto y contexto del negocio</p>
                    <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                      <Info label="Contacto" value={selected.brief.contactName || '—'} />
                      <Info label="Teléfono" value={selected.brief.contactPhone || '—'} />
                      <Info label="Negocio" value={selected.brief.businessName || '—'} />
                      <Info label="Estilo/referencia" value={selected.brief.stylePreference || '—'} />
                    </dl>
                    <div className="mt-4 grid gap-3 text-sm">
                      <Info label="¿A qué se dedica?" value={selected.brief.businessSummary || '—'} />
                      <Info label="Objetivo del sitio" value={selected.brief.siteGoal || '—'} />
                      <Info label="Dominio personalizado deseado" value={selected.brief.customDomainPreference || 'No indicado'} />
                      <Info label="Preferencia de mantenimiento" value={maintenancePreferenceLabel(selected.brief.maintenancePlanPreference)} />
                      {selected.brief.maintenanceSecurityAddOn ? (
                        <Info label="Add-on de seguridad" value="Solicitado" />
                      ) : null}
                      {selected.brief.referenceNotes ? (
                        <Info label="Notas adicionales" value={selected.brief.referenceNotes} />
                      ) : null}
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
                  <section className="space-y-4 border-t border-surface-border pt-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                        Seguimiento comercial y operativo
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-gray-900">
                        Estado completo del flujo Starter
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Aquí se ve la oferta aceptada, las 4 fases, la orden de trabajo, el
                        proyecto Starter del cliente, el proyecto interno de Oracle, el
                        mantenimiento y la publicación.
                      </p>
                    </div>
                    <dl className="grid gap-4 text-sm sm:grid-cols-2">
                      {lifecycle ? (
                        <div className="sm:col-span-2 rounded-xl border border-brand-200 bg-brand-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Fases 0–4 y demo</p>
                          <p className="mt-1 text-sm text-gray-700">
                            <b>{lifecycle.siteName}</b> · <a className="text-brand-700 underline" href={`https://${lifecycle.slug}.lmwares.com`} target="_blank" rel="noreferrer">{lifecycle.slug}.lmwares.com</a>
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {demoPhases.map((phase) => <span className="rounded-full bg-white px-3 py-1 font-semibold text-gray-700" key={phase.id}>Fase {phase.phase}: {phase.status}</span>)}
                          </div>
                          {agentJobs.length > 0 ? (
                            <div className="mt-3 rounded-lg bg-white/80 p-3 text-sm text-gray-700">
                              {agentJobs.map((job) => <p key={job.id}>Agente {job.jobType}: <b>{job.status}</b>{job.projectPath ? ` · ${job.projectPath}` : ''}{job.errorMessage ? ` · ${job.errorMessage}` : ''}</p>)}
                            </div>
                          ) : null}
                          {(() => {
                            const generated = agentJobs.find((job) => job.jobType === 'demo' && job.status === 'completed');
                            const releaseId = generated && generated.result && typeof generated.result.releaseId === 'string'
                              ? generated.result.releaseId
                              : null;
                            if (generated && releaseId && !lifecycle.demoPublishedAt) {
                              return (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <a className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-700" href={`/admin/commercial-intakes/${selected.id}/demo/releases/${releaseId}/review`} target="_blank" rel="noreferrer">Abrir revision privada</a>
                                  <Button onClick={() => void approveGeneratedRelease(releaseId)} disabled={activeAction !== null}>{activeAction === 'demo' ? 'Aprobando...' : 'Aprobar demo y mostrar al cliente'}</Button>
                                  {actionError ? <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{actionError}</p> : null}
                                </div>
                              );
                            }
                            return generated && !lifecycle.demoPublishedAt ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                <a className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-700" href={`/admin/commercial-intakes/${selected.id}/demo/review`} target="_blank" rel="noreferrer">Abrir revisión privada</a>
                                <Button onClick={() => void approveGeneratedDemo()} disabled={activeAction !== null}>{activeAction === 'demo' ? 'Aprobando…' : 'Aprobar demo y mostrar al cliente'}</Button>
                              </div>
                            ) : null;
                          })()}
                          {!lifecycle.demoPublishedAt ? (
                            <div className="mt-4 space-y-2">
                              <Textarea rows={6} value={demoHtml} onChange={(event) => setDemoHtml(event.target.value)} placeholder="Pega el HTML completo de la demo pública. Se publicará en el subdominio del cliente." />
                              <Button onClick={() => void publishDemo()} disabled={activeAction !== null || !demoHtml.trim()}>{activeAction === 'demo' ? 'Publicando…' : 'Publicar demo en subdominio'}</Button>
                            </div>
                          ) : null}
                          <div className="mt-4 space-y-2">
                            <Textarea rows={3} value={phaseEvidence} onChange={(event) => setPhaseEvidence(event.target.value)} placeholder="Evidencia o nota del cierre de fase" />
                            {demoPhases.find((phase) => phase.phase === 0)?.status === 'in_progress' ? <Button onClick={() => void completePhaseZero()} disabled={activeAction !== null || !phaseEvidence.trim()}>Terminar fase 0 y habilitar pago 1</Button> : null}
                            {demoPhases.filter((phase) => phase.phase > 0).map((phase) => (
                              <span className="mr-2 inline-flex gap-2" key={`action-${phase.id}`}>
                                {phase.status === 'payment_due' || phase.status === 'payment_confirmed' ? <Button variant="secondary" onClick={() => void advanceDemoPhase(phase.phase as 1 | 2 | 3 | 4, false)} disabled={activeAction !== null}>Iniciar fase {phase.phase}</Button> : null}
                                {phase.status === 'in_progress' ? <Button onClick={() => void advanceDemoPhase(phase.phase as 1 | 2 | 3 | 4, true)} disabled={activeAction !== null || !phaseEvidence.trim()}>Terminar fase {phase.phase}</Button> : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <Info
                        label="Oferta aceptada"
                        value={
                          acceptedOffer
                            ? `v${acceptedOffer.version} aceptada el ${acceptedOffer.acceptedAt ? formatDate(acceptedOffer.acceptedAt) : 'cliente pendiente de pago fase 1'}`
                            : 'Todavía no existe una oferta aceptada; el cliente aún debe aceptar una versión vigente.'
                        }
                      />
                      <Info
                        label="Decisión de mantenimiento"
                        value={acceptedOffer ? maintenanceDecisionSummary(acceptedOffer) : maintenancePreferenceLabel(selected.brief.maintenancePlanPreference)}
                      />
                      <Info
                        label="Estado de la orden de trabajo"
                        value={workOrder ? workOrderStatusLabel(workOrder.status) : 'La orden de trabajo se creará cuando la fase 1 quede pagada.'}
                      />
                      <Info
                        label="Estado de publicación"
                        value={
                          workOrder?.status === 'live'
                            ? `Publicado en ${workOrder.publishedUrl ?? 'URL pendiente de registrar'}`
                            : publicationReady
                              ? 'Listo para publicar en cuanto el admin confirme la URL.'
                              : `Bloqueado por ${publicationBlockers.length} requisito(s).`
                        }
                      />
                      <Info
                        label="Proyecto Starter del cliente"
                        value={
                          clientProject ? (
                            <div className="space-y-1">
                              <div>{clientProject.siteName} · {clientProjectStatusLabel(clientProject.status)}</div>
                              <Link
                                className="text-sm font-semibold text-brand-700 hover:underline"
                                to={`/starter-domains?clientProjectId=${encodeURIComponent(clientProject.id)}`}
                              >
                                Ver dominios del proyecto Starter
                              </Link>
                            </div>
                          ) : 'Aún no existe proyecto Starter visible; verifica que la fase 1 esté pagada y que la orden se haya aprovisionado.'
                        }
                      />
                      <Info
                        label="Proyecto interno de Oracle"
                        value={
                          workOrder?.projectId ? (
                            <Link
                              className="font-semibold text-brand-700 hover:underline"
                              to={`/projects?projectId=${encodeURIComponent(workOrder.projectId)}`}
                            >
                              {workOrder.projectId} · Abrir registro interno
                            </Link>
                          ) : 'Falta enlazar el proyecto interno de Oracle antes de avanzar a publicación.'
                        }
                      />
                      <Info
                        label="Subdominio Starter reservado"
                        value={
                          clientProject
                            ? `${clientProject.slug}.lmwares.com`
                            : 'Aún no hay subdominio visible; se genera con el proyecto Starter del cliente.'
                        }
                      />
                      <Info
                        label="Mensualidad / autorización"
                        value={maintenanceStatusSummary(acceptedOffer, maintenanceSubscription)}
                      />
                    </dl>
                    <div className="rounded-xl border border-surface-border bg-surface-muted/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Fases de implementación
                          </p>
                          <p className="mt-1 text-sm text-gray-700">
                            {billingOrders.filter((order) => order.status === 'paid').length}/4 fases
                            pagadas.
                          </p>
                        </div>
                        {phase1Order && acceptedOffer && phase1Order.status !== 'paid' ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                            Oferta aceptada esperando fase 1
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {phaseOrders.map(({ phase, order }) => (
                          <article key={phase} className="rounded-lg border border-white bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-gray-900">Fase {phase}</p>
                              <span className={phaseStatusClass(order)}>
                                {phaseStatusLabel(order)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-gray-700">
                              {phaseStatusDetail(order, phase)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {order ? `${money(order.amountCents)} · ${order.status}` : 'Sin orden generada todavía'}
                            </p>
                          </article>
                        ))}
                      </div>
                      {localTestFixturesAvailable && acceptedOffer && billingOrders.length === 4 && billingOrders.some((order) => order.status !== 'paid') ? (
                        <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                          <p className="font-semibold">Fixture local de pago</p>
                          <p className="mt-1">Marca las cuatro fases como pagadas para probar el perfil, el mantenimiento y los dominios sin abrir Mercado Pago.</p>
                          <Button className="mt-3" variant="secondary" onClick={markImplementationPhasesTestPaid} disabled={activeAction !== null}>
                            {activeAction === 'test_paid' ? 'Preparando fixture…' : 'Marcar 4 fases como pagadas (local)'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {workOrder ? (
                      <div className="rounded-xl border border-surface-border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                              Operación del work order
                            </p>
                            <h4 className="mt-1 text-lg font-bold text-gray-900">
                              Orden de trabajo Starter
                            </h4>
                            <p className="mt-1 text-sm text-gray-500">
                              El proyecto del cliente se reserva con la fase 1; el repositorio
                              interno de Oracle se enlaza y opera por separado.
                            </p>
                          </div>
                          {workOrder.assignedBy ? (
                            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs text-gray-600">
                              Enlazado por {workOrder.assignedBy}
                            </span>
                          ) : null}
                        </div>
                        {actionError ? (
                          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {actionError}
                          </p>
                        ) : null}
                        {!workOrder.projectId ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <select
                              aria-label="Proyecto Oracle"
                              className="rounded-lg border border-surface-border px-3 py-2 text-sm"
                              value={projectId}
                              onChange={(event) => setProjectId(event.target.value)}
                              disabled={activeAction !== null}
                            >
                              <option value="">Selecciona un proyecto sincronizado</option>
                              {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name} · {project.id}
                                </option>
                              ))}
                            </select>
                            <Button
                              onClick={assignProject}
                              disabled={activeAction !== null || !projectId}
                            >
                              {activeAction === 'assign' ? 'Enlazando…' : 'Enlazar proyecto Oracle'}
                            </Button>
                          </div>
                        ) : null}
                        <div className="mt-4 flex flex-wrap gap-3">
                          {workOrder.status === 'in_build' ? (
                            <Button
                              onClick={() => changeWorkStatus('client_review')}
                              disabled={activeAction !== null}
                            >
                              {activeAction === 'status'
                                ? 'Actualizando…'
                                : 'Enviar a revisión del cliente'}
                            </Button>
                          ) : null}
                          {workOrder.status === 'client_review' ? (
                            <>
                              <Button
                                variant="secondary"
                                onClick={() => changeWorkStatus('in_build')}
                                disabled={activeAction !== null}
                              >
                                {activeAction === 'status'
                                  ? 'Actualizando…'
                                  : 'Volver a construcción'}
                              </Button>
                              <Button
                                onClick={() => changeWorkStatus('ready_to_publish')}
                                disabled={activeAction !== null}
                              >
                                {activeAction === 'status'
                                  ? 'Actualizando…'
                                  : 'Marcar lista para publicar'}
                              </Button>
                            </>
                          ) : null}
                          {workOrder.status === 'ready_to_publish' ? (
                            <div className="w-full space-y-3">
                              <Button
                                variant="secondary"
                                onClick={() => changeWorkStatus('client_review')}
                                disabled={activeAction !== null}
                              >
                                {activeAction === 'status'
                                  ? 'Actualizando…'
                                  : 'Volver a revisión del cliente'}
                              </Button>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <input
                                  aria-label="URL pública inicial"
                                  className="rounded-lg border border-surface-border px-3 py-2 text-sm"
                                  placeholder="https://cliente.lmwares.com"
                                  value={publicUrl}
                                  onChange={(event) => setPublicUrl(event.target.value)}
                                  disabled={activeAction !== null}
                                />
                                <Button
                                  onClick={publishWorkOrder}
                                  disabled={activeAction !== null || publicationBlockers.length > 0}
                                >
                                  {activeAction === 'publish'
                                    ? 'Publicando…'
                                    : 'Confirmar publicación'}
                                </Button>
                              </div>
                              {!isValidStarterPublicationUrl(publicUrl) && publicUrl.trim() ? (
                                <p className="text-xs text-amber-700">
                                  Usa una URL HTTPS terminada en <code>.lmwares.com</code> antes de
                                  publicar.
                                </p>
                              ) : null}
                              {publicationBlockers.length ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                  <p className="font-semibold">
                                    Publicación bloqueada hasta resolver lo siguiente:
                                  </p>
                                  <ul className="mt-2 list-disc space-y-1 pl-5">
                                    {publicationBlockers.map((blocker) => (
                                      <li key={blocker}>{blocker}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {workOrder.status === 'live' && workOrder.publishedUrl ? (
                            <a
                              className="text-sm font-semibold text-blue-700"
                              href={workOrder.publishedUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Abrir sitio publicado ↗
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                  {actionError && !workOrder ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {actionError}
                    </p>
                  ) : null}
                  {selected.status === 'submitted' || selected.status === 'scope_review' ? (
                    <div className="space-y-2">
                      {selected.status === 'submitted' ? (
                        <p className="text-xs text-gray-500">
                          Tomar revisión es la evaluación Fase 0: no tiene costo para el cliente y no
                          arranca ningún trabajo todavía. El proyecto pagado (Fase 1) empieza cuando
                          el cliente acepta la oferta y paga el primer 25%.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={() => review('scope_review')} disabled={activeAction !== null}>
                          {activeAction === 'review'
                            ? 'Guardando…'
                            : selected.status === 'submitted'
                              ? 'Tomar revisión'
                              : 'Guardar revisión'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => review('declined')}
                          disabled={activeAction !== null}
                        >
                          No aprobar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {selected.status === 'scope_review' || selected.status === 'offer_ready' ? (
                    <section className="space-y-4 border-t border-surface-border pt-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                          Oferta versionada
                        </p>
                        <h3 className="mt-1 text-xl font-bold text-gray-900">
                          {offers.some((offer) => offer.status === 'issued')
                            ? 'Emitir una revisión'
                            : 'Preparar oferta final'}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Vigencia automática de 15 días. El monto mensual final se deriva de la
                          decisión real de mantenimiento del cliente.
                        </p>
                      </div>
                      {offers.length ? (
                        <div className="space-y-2">
                          {offers.map((offer) => (
                            <div
                              key={offer.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm"
                            >
                              <span>
                                v{offer.version} · {money(offer.implementationAmountCents)} +{' '}
                                {money(offer.monthlyAmountCents)}/mes
                              </span>
                              <b className="text-brand-700">
                                {commercialOfferStatusLabel(offer.status)}
                              </b>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {acceptedOffer && phase1Order && phase1Order.status !== 'paid' ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          <p className="font-semibold">Cobro de fase 1 pendiente o vencido</p>
                          <p className="mt-1">
                            Si el checkout expiró o el cliente necesita otra versión, cancela este
                            cobro y vuelve la solicitud a revisión para emitir una oferta nueva.
                          </p>
                          <Button
                            className="mt-3"
                            variant="secondary"
                            onClick={reopenImplementationPayment}
                            disabled={activeAction !== null}
                          >
                            {activeAction === 'reopen'
                              ? 'Reabriendo…'
                              : 'Cancelar cobro y reabrir oferta'}
                          </Button>
                        </div>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <OfferInput
                          label="Implementación (MXN · mínimo $40 en 4 fases)"
                          value={offerForm.implementationPesos}
                          onChange={(value) =>
                            setOfferForm((current) => ({
                              ...current,
                              implementationPesos: value,
                            }))
                          }
                        />
                        <OfferInput
                          label="Mantenimiento mostrado (referencia visual)"
                          value={offerForm.monthlyPesos}
                          onChange={(value) =>
                            setOfferForm((current) => ({ ...current, monthlyPesos: value }))
                          }
                        />
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium text-gray-700">Módulos finales</p>
                        <div className="flex flex-wrap gap-2">
                          {PACKAGE_MODULE_IDS.map((module) => (
                            <label
                              key={module}
                              className="flex items-center gap-2 rounded-full border border-surface-border px-3 py-1 text-sm"
                            >
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
                        AstraMuses está anunciado como Próximamente y no puede incluirse ni cobrarse
                        en esta oferta.
                      </p>
                      <OfferText
                        label="Resumen de alcance"
                        value={offerForm.scopeSummary}
                        onChange={(value) =>
                          setOfferForm((current) => ({ ...current, scopeSummary: value }))
                        }
                      />
                      <OfferText
                        label="Qué cubre la implementación"
                        value={offerForm.implementationDescription}
                        onChange={(value) =>
                          setOfferForm((current) => ({
                            ...current,
                            implementationDescription: value,
                          }))
                        }
                      />
                      <OfferText
                        label="Qué cubre la mensualidad"
                        value={offerForm.recurringDescription}
                        onChange={(value) =>
                          setOfferForm((current) => ({ ...current, recurringDescription: value }))
                        }
                      />
                      <Button
                        onClick={issueOffer}
                        disabled={activeAction !== null || offers.some((offer) => offer.status === 'accepted')}
                      >
                        {activeAction === 'offer'
                          ? 'Emitiendo…'
                          : offers.some((offer) => offer.status === 'issued')
                            ? 'Emitir nueva versión'
                            : 'Emitir oferta'}
                      </Button>
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

function Info({ label, value }: { label: string; value: ReactNode }) {
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

function maintenancePreferenceLabel(preference: 'later' | 'none' | 'basic' | 'advanced'): string {
  const labels: Record<typeof preference, string> = {
    later: 'Configurar luego (sin decisión)',
    none: 'Sin mantenimiento',
    basic: 'Interesado en Básico',
    advanced: 'Interesado en Avanzado',
  };
  return labels[preference];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function workOrderStatusLabel(status: StarterWorkOrder['status']): string {
  const labels: Record<StarterWorkOrder['status'], string> = {
    awaiting_provisioning: 'Fase 1 pagada; falta enlazar el proyecto interno de Oracle',
    in_build: 'En construcción',
    client_review: 'En revisión del cliente',
    ready_to_publish: 'Lista para publicar cuando mantenimiento y URL estén resueltos',
    live: 'Publicada',
    canceled: 'Cancelada',
  };
  return labels[status];
}

function subscriptionStatusLabel(status: MaintenanceSubscription['status']): string {
  const labels: Record<MaintenanceSubscription['status'], string> = {
    creating: 'Preparando autorización',
    creation_failed: 'Falló la creación de la suscripción',
    pending_authorization: 'Pendiente: el cliente debe autorizarla',
    active: 'Activa',
    payment_attention: 'Requiere revisión de cobro',
    paused: 'Pausada',
    canceled: 'Cancelada',
    disputed: 'En disputa',
  };
  return labels[status];
}

function clientProjectStatusLabel(status: StarterClientProject['status']): string {
  const labels: Record<StarterClientProject['status'], string> = {
    provisioning: 'Reservado; falta activarlo en operación',
    active: 'Activo',
    archived: 'Archivado',
  };
  return labels[status];
}

function commercialOfferStatusLabel(status: CommercialOffer['status']): string {
  const labels: Record<CommercialOffer['status'], string> = {
    issued: 'Emitida y esperando respuesta del cliente',
    accepted: 'Aceptada por el cliente',
    superseded: 'Reemplazada por otra versión',
    declined: 'No aprobada por el cliente',
    expired: 'Vencida',
  };
  return labels[status];
}

function maintenanceDecisionSummary(offer: CommercialOffer): string {
  if (offer.maintenancePlanSelected === null) {
    return 'Pendiente: el cliente decidió elegir su mantenimiento más adelante.';
  }
  if (offer.maintenancePlanSelected === 'none') {
    return 'Sin mantenimiento mensual; venta de pago único.';
  }
  return `${offer.maintenancePlanSelected === 'basic' ? 'Básico' : 'Avanzado'} · ${money(offer.monthlyAmountCents)}/mes`;
}

function maintenanceStatusSummary(
  offer: CommercialOffer | null,
  subscription: MaintenanceSubscription | null,
): string {
  if (!offer) {
    return 'La mensualidad todavía depende de que exista una oferta aceptada.';
  }
  if (offer.maintenancePlanSelected === null) {
    return 'Pendiente: el cliente aún no decide si quiere mantenimiento.';
  }
  if (offer.maintenancePlanSelected === 'none') {
    return 'No contratada: el sitio puede publicarse sin suscripción mensual.';
  }
  if (!subscription) {
    return 'Falta generar la suscripción y conseguir que el cliente la autorice.';
  }
  return `${subscriptionStatusLabel(subscription.status)} · ${money(subscription.amountCents)}/mes`;
}

function phaseStatusLabel(order: BillingOrder | null): string {
  if (!order) return 'Falta preparar';
  if (order.status === 'paid') return 'Pagada';
  if (isExpiredPendingOrder(order)) return 'Checkout vencido';
  return 'Pendiente';
}

function phaseStatusClass(order: BillingOrder | null): string {
  if (!order) return 'rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700';
  if (order.status === 'paid') {
    return 'rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700';
  }
  if (isExpiredPendingOrder(order)) {
    return 'rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800';
  }
  return 'rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700';
}

function phaseStatusDetail(order: BillingOrder | null, phase: 1 | 2 | 3 | 4): string {
  if (!order) {
    return `La orden de cobro de la fase ${phase} todavía no aparece en el expediente.`;
  }
  if (order.status === 'paid') {
    return `La fase ${phase} ya quedó confirmada y no bloquea el siguiente paso.`;
  }
  if (isExpiredPendingOrder(order)) {
    return `El checkout de la fase ${phase} venció o quedó sin confirmar; revisa si conviene reabrir la oferta.`;
  }
  return `La fase ${phase} sigue ${order.status}; espera confirmación o reconcíliala si quedó atascada.`;
}

function isExpiredPendingOrder(order: BillingOrder): boolean {
  return Boolean(
    order.status !== 'paid' &&
      order.checkoutExpiresAt &&
      Number.isFinite(Date.parse(order.checkoutExpiresAt)) &&
      Date.parse(order.checkoutExpiresAt) <= Date.now(),
  );
}
