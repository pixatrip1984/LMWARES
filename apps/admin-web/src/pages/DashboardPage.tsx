import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, PageHeader, Spinner } from '@starter/ui';
import { api } from '../lib/api';
import type { StuckPaymentItem, StuckPaymentsSummary } from '@starter/api-client';
import { isClientStarterProject } from '../lib/project-classification';

interface ProjectSummary {
  clientTotal: number;
  clientAttention: number;
  internalTotal: number;
}

export function DashboardPage() {
  const [counts, setCounts] = useState<{ pubs: number; reqs: number } | null>(null);
  const [stuckPayments, setStuckPayments] = useState<StuckPaymentsSummary | null>(null);
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    Promise.all([
      api.listPublications({ page: 1, pageSize: 1 }),
      api.listRequests({ page: 1, pageSize: 1 }),
    ])
      .then(([p, r]) => setCounts({ pubs: p.total, reqs: r.total }))
      .catch(() => setCounts({ pubs: 0, reqs: 0 }));
    api
      .getStuckPayments()
      .then(setStuckPayments)
      .catch(() => setStuckPayments(null));
    api
      .listLmwaresProjects()
      .then(({ projects }) => {
        const clientProjects = projects.filter((project) => isClientStarterProject(project));
        setProjectSummary({
          clientTotal: clientProjects.length,
          clientAttention: clientProjects.filter((project) => project.health !== 'on-track')
            .length,
          internalTotal: projects.length - clientProjects.length,
        });
      })
      .catch(() => setProjectSummary(null));
  }, []);

  return (
    <div>
      <PageHeader title="Panel" subtitle="Resumen del proyecto" />
      {stuckPayments && stuckPayments.total > 0 ? (
        <Card className="mb-4 border-l-4 border-red-500 bg-red-50">
          <CardBody>
            <p className="text-sm font-medium text-red-700">
              ⚠️ {stuckPayments.total} pago{stuckPayments.total === 1 ? '' : 's'} sin confirmar hace más
              de {stuckPayments.thresholdHours}h
            </p>
            <p className="mt-1 text-xs text-red-600">
              Fases: {stuckPayments.byType.billingOrders} · Paquetes:{' '}
              {stuckPayments.byType.packageProposals} · Mensualidades paquete:{' '}
              {stuckPayments.byType.packageSubscriptions} · Mensualidades mantenimiento:{' '}
              {stuckPayments.byType.maintenanceSubscriptions}
            </p>
            <p className="mt-1 text-xs text-red-500">
              El cron ya lo intentó reconciliar automáticamente sin éxito; revisa el estado en
              Mercado Pago o contacta al cliente.
            </p>
            {stuckPayments.items.length ? (
              <div className="mt-3 space-y-2">
                {stuckPayments.items.slice(0, 8).map((item) => (
                  <StuckPaymentRow
                    item={item}
                    key={`${item.kind}:${item.id}`}
                    onReconciled={(reconciledItem, status) => {
                      setStuckPayments((current) => {
                        if (!current) return current;
                        const items = current.items.map((existing) =>
                          existing.kind === reconciledItem.kind && existing.id === reconciledItem.id
                            ? { ...existing, status }
                            : existing,
                        );
                        return { ...current, items };
                      });
                      api
                        .getStuckPayments()
                        .then(setStuckPayments)
                        .catch(() => undefined);
                    }}
                  />
                ))}
                {stuckPayments.total > stuckPayments.items.length ? (
                  <p className="text-xs text-red-600">
                    Hay {stuckPayments.total - stuckPayments.items.length} registro(s) adicional(es).
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
      {projectSummary && projectSummary.clientAttention > 0 ? (
        <Link to="/projects">
          <Card className="mb-4 border-l-4 border-amber-500 bg-amber-50 transition-shadow hover:shadow-md">
            <CardBody>
              <p className="text-sm font-medium text-amber-800">
                ⚠️ {projectSummary.clientAttention} sitio
                {projectSummary.clientAttention === 1 ? '' : 's'} Starter de cliente
                {projectSummary.clientAttention === 1 ? '' : 's'} requiere
                {projectSummary.clientAttention === 1 ? '' : 'n'} atención
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Revisa el registro de proyectos para ver fases bloqueadas o en riesgo.
              </p>
            </CardBody>
          </Card>
        </Link>
      ) : null}
      {!counts ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Link to="/publications">
            <Card className="transition-shadow hover:shadow-md">
              <CardBody>
                <p className="text-sm text-gray-500">Publicaciones</p>
                <p className="text-3xl font-bold text-gray-900">{counts.pubs}</p>
              </CardBody>
            </Card>
          </Link>
          <Link to="/requests">
            <Card className="transition-shadow hover:shadow-md">
              <CardBody>
                <p className="text-sm text-gray-500">Solicitudes</p>
                <p className="text-3xl font-bold text-gray-900">{counts.reqs}</p>
              </CardBody>
            </Card>
          </Link>
          <Link to="/projects">
            <Card className="transition-shadow hover:shadow-md">
              <CardBody>
                <p className="text-sm text-gray-500">Proyectos cliente Starter</p>
                <p className="text-3xl font-bold text-gray-900">
                  {projectSummary ? projectSummary.clientTotal : '—'}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {projectSummary ? `${projectSummary.internalTotal} internos de Oracle` : ''}
                </p>
              </CardBody>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}

function StuckPaymentRow({
  item,
  onReconciled,
}: {
  item: StuckPaymentItem;
  onReconciled: (item: StuckPaymentItem, status: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleReconcile() {
    if (state === 'loading') return;
    setState('loading');
    setErrorMessage(null);
    try {
      const result = await api.reconcileStuckPayment(item.kind, item.id);
      onReconciled(item, result.status);
    } catch (error) {
      setState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'No fue posible reconciliar el pago.',
      );
      return;
    }
    setState('idle');
  }

  return (
    <div className="rounded border border-red-200 bg-white/70 px-3 py-2 text-xs text-red-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{stuckPaymentLabel(item)}</span>
        <span className="font-mono">{item.status}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-red-700">
        <span>{formatCents(item.amountCents, item.currency)}</span>
        <span>{formatAge(item.ageMinutes)}</span>
        <span>{item.providerStatus ?? 'sin estado del proveedor'}</span>
        <span className="font-mono">{item.id.slice(0, 12)}…</span>
        {item.intakeId ? (
          <Link
            to={`/commercial-intakes?intakeId=${encodeURIComponent(item.intakeId)}`}
            className="font-semibold text-red-700 underline underline-offset-2"
          >
            Abrir intake relacionado
          </Link>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleReconcile}
          disabled={state === 'loading'}
          className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === 'loading' ? 'Reconciliando…' : 'Reconciliar ahora'}
        </button>
        {errorMessage ? <span className="text-red-600">{errorMessage}</span> : null}
      </div>
    </div>
  );
}

function stuckPaymentLabel(item: StuckPaymentItem): string {
  switch (item.kind) {
    case 'implementation_phase':
      return `Fase ${item.phase ?? '—'} de implementación`;
    case 'package_proposal':
      return 'Propuesta de paquete';
    case 'package_subscription':
      return 'Mensualidad de paquete';
    case 'maintenance_subscription':
      return 'Mensualidad Starter';
  }
}

function formatCents(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatAge(ageMinutes: number): string {
  if (ageMinutes < 60) return `${ageMinutes} min sin resolver`;
  return `${Math.floor(ageMinutes / 60)} h sin resolver`;
}
