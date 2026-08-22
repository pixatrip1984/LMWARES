import { useEffect, useState } from 'react';
import type { DiscountCode } from '@starter/domain';
import { api } from '../lib/api';

type ExpiryMode = 'time' | 'quantity';

export function DiscountCodesPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Formulario de creación
  const [codeValue, setCodeValue] = useState('');
  const [percent, setPercent] = useState<5 | 10 | 15>(15);
  const [plan, setPlan] = useState<'starter' | 'pro' | ''>('');
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>('quantity');
  const [maxRedemptions, setMaxRedemptions] = useState('10');
  const [expiresAt, setExpiresAt] = useState('');
  const [qrData, setQrData] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCodes((await api.listDiscountCodes()).codes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los códigos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const input: {
        code: string;
        discountPercent: 5 | 10 | 15;
        plan?: 'starter' | 'pro';
        qrData?: string;
        maxRedemptions?: number;
        expiresAt?: string;
      } = {
        code: codeValue,
        discountPercent: percent,
        qrData: qrData.trim() || undefined,
      };
      if (plan) input.plan = plan;
      if (expiryMode === 'quantity') {
        input.maxRedemptions = Number(maxRedemptions);
      } else {
        input.expiresAt = new Date(expiresAt).toISOString();
      }
      await api.createDiscountCode(input);
      setCodeValue('');
      setQrData('');
      setMaxRedemptions('10');
      setExpiresAt('');
      await load();
    } catch (createError) {
      setFormError(createError instanceof Error ? createError.message : 'No se pudo crear el código.');
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (code: DiscountCode) => {
    setBusyId(code.id);
    setError(null);
    try {
      const next = code.status === 'active' ? 'disabled' : 'active';
      const result = await api.updateDiscountCodeStatus(code.id, { status: next });
      setCodes((current) => current.map((item) => (item.id === code.id ? result.code : item)));
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'No se pudo actualizar el código.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (code: DiscountCode) => {
    if (!window.confirm(`¿Eliminar el código ${code.code}?`)) return;
    setBusyId(code.id);
    setError(null);
    try {
      await api.deleteDiscountCode(code.id);
      setCodes((current) => current.filter((item) => item.id !== code.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo eliminar el código.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
          Operación · Promociones
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Códigos de descuento</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Crea códigos del 5, 10 o 15% para promocionar en redes. Cada código expira por tiempo o
          por cantidad de usos. Copia el código o el payload del QR para tu generador.
        </p>
      </header>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Nuevo código</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Código</span>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              onChange={(event) => setCodeValue(event.target.value)}
              placeholder="PROMO15"
              value={codeValue}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Descuento</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              onChange={(event) => setPercent(Number(event.target.value) as 5 | 10 | 15)}
              value={percent}
            >
              <option value={15}>15%</option>
              <option value={10}>10%</option>
              <option value={5}>5%</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Plan (opcional)</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              onChange={(event) => setPlan(event.target.value as 'starter' | 'pro' | '')}
              value={plan}
            >
              <option value="">Starter y Pro</option>
              <option value="starter">Solo Starter</option>
              <option value="pro">Solo Pro</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Expiración</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              onChange={(event) => setExpiryMode(event.target.value as ExpiryMode)}
              value={expiryMode}
            >
              <option value="quantity">Por cantidad de usos</option>
              <option value="time">Por fecha</option>
            </select>
          </label>
          {expiryMode === 'quantity' ? (
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Máximo de usos</span>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                min={1}
                onChange={(event) => setMaxRedemptions(event.target.value)}
                type="number"
                value={maxRedemptions}
              />
            </label>
          ) : (
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Vence el</span>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                onChange={(event) => setExpiresAt(event.target.value)}
                type="datetime-local"
                value={expiresAt}
              />
            </label>
          )}
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Payload del QR (URL de promoción)</span>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              onChange={(event) => setQrData(event.target.value)}
              placeholder="https://lmwares.com/arma-tu-paquete?code=PROMO15"
              value={qrData}
            />
          </label>
        </div>
        {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}
        <button
          className="mt-4 rounded bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={creating || !codeValue.trim()}
          onClick={() => void create()}
          type="button"
        >
          {creating ? 'Creando…' : 'Crear código'}
        </button>
      </div>

      {loading ? <p className="text-sm text-gray-500">Cargando códigos…</p> : null}
      {!loading && !codes.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Todavía no hay códigos de descuento.
        </div>
      ) : null}

      <div className="space-y-3">
        {codes.map((code) => (
          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm" key={code.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-mono text-lg font-semibold text-gray-900">{code.code}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {code.discountPercent}% · {code.plan ?? 'Starter y Pro'} ·{' '}
                  {code.redemptionCount}
                  {code.maxRedemptions != null ? `/${code.maxRedemptions}` : ''} usos
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {code.status}
              </span>
            </div>
            {code.qrData ? (
              <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-700">
                <strong>QR:</strong>{' '}
                <code className="break-all">{code.qrData}</code>
              </div>
            ) : null}
            {code.expiresAt ? (
              <p className="mt-2 text-xs text-gray-500">Vence: {new Date(code.expiresAt).toLocaleString()}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                className="rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
                disabled={busyId === code.id}
                onClick={() => void toggleStatus(code)}
                type="button"
              >
                {code.status === 'active' ? 'Desactivar' : 'Activar'}
              </button>
              <button
                className="rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
                disabled={busyId === code.id}
                onClick={() => void remove(code)}
                type="button"
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
