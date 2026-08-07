import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ClientCustomDomain } from '@starter/domain';
import { api } from '../lib/api';

export function StarterDomainsPage() {
  const [searchParams] = useSearchParams();
  const clientProjectId = searchParams.get('clientProjectId')?.trim() || undefined;
  const [domains, setDomains] = useState<ClientCustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowAction, setRowAction] = useState<Record<string, 'confirm' | 'remove' | null>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDomains((await api.listStarterDomains(clientProjectId)).domains);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los dominios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [clientProjectId]);

  const confirm = async (domain: ClientCustomDomain) => {
    setBusyId(domain.id);
    setError(null);
    setRowErrors((current) => ({ ...current, [domain.id]: '' }));
    setRowAction((current) => ({ ...current, [domain.id]: 'confirm' }));
    try {
      const result = await api.confirmStarterDomain(domain.id);
      setDomains((current) => current.map((item) => (item.id === domain.id ? result.domain : item)));
    } catch (confirmError) {
      const message =
        confirmError instanceof Error ? confirmError.message : 'No se pudo confirmar el dominio.';
      setError(message);
      setRowErrors((current) => ({ ...current, [domain.id]: message }));
    } finally {
      setBusyId(null);
      setRowAction((current) => ({ ...current, [domain.id]: null }));
    }
  };

  const remove = async (domain: ClientCustomDomain) => {
    if (!window.confirm(`¿Retirar ${domain.hostname}?`)) return;
    setBusyId(domain.id);
    setError(null);
    setRowErrors((current) => ({ ...current, [domain.id]: '' }));
    setRowAction((current) => ({ ...current, [domain.id]: 'remove' }));
    try {
      const result = await api.removeStarterDomain(domain.id);
      setDomains((current) => current.map((item) => (item.id === domain.id ? result.domain : item)));
    } catch (removeError) {
      const message =
        removeError instanceof Error ? removeError.message : 'No se pudo retirar el dominio.';
      setError(message);
      setRowErrors((current) => ({ ...current, [domain.id]: message }));
    } finally {
      setBusyId(null);
      setRowAction((current) => ({ ...current, [domain.id]: null }));
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
          Operación · Starter
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Dominios personalizados</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Confirma manualmente el DNS del cliente. La activación automática de SSL y proveedor
          permanece bloqueada hasta configurar un adaptador real.
        </p>
        {clientProjectId ? (
          <p className="mt-2 text-sm text-gray-600">
            Mostrando sólo dominios del proyecto Starter{' '}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">{clientProjectId}</code>.{' '}
            <Link className="font-semibold text-brand-700 hover:underline" to="/starter-domains">
              Ver todos
            </Link>
          </p>
        ) : null}
      </header>
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}
      {loading ? <p className="text-sm text-gray-500">Cargando dominios…</p> : null}
      {!loading && !domains.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Todavía no hay dominios personalizados registrados.
        </div>
      ) : null}
      <div className="space-y-3">
        {domains.map((domain) => (
          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm" key={domain.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">{domain.hostname}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Proyecto {domain.clientProjectId} · {domain.type} · {domain.provider ?? 'manual'}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {domain.status}
              </span>
            </div>
            <div className="mt-4 space-y-1 rounded bg-gray-50 p-3 text-xs text-gray-700">
              {domain.dnsInstructions.map((instruction) => (
                <div key={`${instruction.type}-${instruction.name}`}>
                  <strong>{instruction.type}</strong> {instruction.name} → {instruction.value}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              {domain.status === 'pending_verification' || domain.status === 'failed' ? (
                <button
                  className="rounded bg-brand-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={busyId === domain.id}
                  onClick={() => void confirm(domain)}
                  type="button"
                >
                  {busyId === domain.id && rowAction[domain.id] === 'confirm'
                    ? 'Confirmando…'
                    : 'Confirmar DNS manualmente'}
                </button>
              ) : null}
              {domain.status !== 'removed' ? (
                <button
                  className="rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
                  disabled={busyId === domain.id}
                  onClick={() => void remove(domain)}
                  type="button"
                >
                  {busyId === domain.id && rowAction[domain.id] === 'remove'
                    ? 'Retirando…'
                    : 'Retirar'}
                </button>
              ) : null}
            </div>
            {rowErrors[domain.id] ? (
              <p className="mt-3 text-xs text-red-600">{rowErrors[domain.id]}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
