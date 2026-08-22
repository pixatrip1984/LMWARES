import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccountNotification,
  AccountOverview,
  AccountSite,
  CreatePublicCustomDomainResult,
  PublicCustomDomain,
  PublicDomainAvailability,
  PublicMaintenanceSubscription,
  PublicPackageIntake,
  PublicStarterClientProject,
  PublicStarterWorkOrder,
} from '@starter/api-client';
import { maintenanceActionLabel } from '../../lib/maintenance-ui';
import './accountCenterModal.css';

export type AccountCenterTab = 'notifications' | 'sites' | 'account';

type AccountCenterModalProps = {
  error: string;
  initialTab: AccountCenterTab;
  loading: boolean;
  onClose: () => void;
  onAcceptOffer: (intakeId: string, offerId: string, termsVersion: string) => Promise<void>;
  onCreateStarterDomain: (
    clientProjectId: string,
    input: { hostname: string; type: 'www' | 'app' },
  ) => Promise<CreatePublicCustomDomainResult>;
  onMarkAllRead: () => Promise<void>;
  onMarkRead: (notificationId: string) => Promise<void>;
  onPurchaseStarterDomain: (
    clientProjectId: string,
    input: { domain: string },
  ) => Promise<CreatePublicCustomDomainResult>;
  onReload: () => Promise<void>;
  onRemoveStarterDomain: (clientProjectId: string, domainId: string) => Promise<unknown>;
  onSearchStarterDomains: (
    clientProjectId: string,
    input: { sld: string },
  ) => Promise<PublicDomainAvailability[]>;
  onSignOut: () => Promise<void>;
  open: boolean;
  overview: AccountOverview | null;
};

const SITE_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  queued: 'En cola',
  generating: 'Generando',
  validating: 'Validando',
  published: 'Publicada',
  notified: 'Publicada y notificada',
  needs_information: 'Faltan datos',
  generation_failed: 'Requiere atención',
  moderation_hold: 'En revisión',
  manual_review: 'En revisión manual',
};

const MODULE_PRESENTATION: Record<string, { label: string; visual: string }> = {
  landing: { label: 'Sitio web', visual: '/assets/package-builder/landing-consulting.webp' },
  panel: { label: 'Panel', visual: '/assets/package-builder/panel.webp' },
  blog: { label: 'Blog', visual: '/assets/package-builder/blog-frontier-lab.webp' },
  galleries: { label: 'Galerías', visual: '/assets/package-builder/galleries-paintings.webp' },
  catalog: { label: 'Catálogo', visual: '/assets/package-builder/catalog.webp' },
  quote: { label: 'Formulario', visual: '/assets/package-builder/formulario.webp' },
  events: { label: 'Eventos', visual: '/assets/package-builder/events.webp' },
  docs: { label: 'Docs', visual: '/assets/package-builder/docs.webp' },
};

export function AccountCenterModal({
  error,
  initialTab,
  loading,
  onClose,
  onAcceptOffer,
  onCreateStarterDomain,
  onMarkAllRead,
  onMarkRead,
  onPurchaseStarterDomain,
  onReload,
  onRemoveStarterDomain,
  onSearchStarterDomains,
  onSignOut,
  open,
  overview,
}: AccountCenterModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<AccountCenterTab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);

  const selectedNotification = useMemo(
    () =>
      overview?.notifications.find(({ id }) => id === selectedId) ??
      overview?.notifications[0] ??
      null,
    [overview, selectedId],
  );

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setCopyState(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 40);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [initialTab, onClose, open]);

  useEffect(() => {
    if (!open || tab !== 'notifications' || !selectedNotification || selectedNotification.readAt) {
      return;
    }
    void onMarkRead(selectedNotification.id);
  }, [onMarkRead, open, selectedNotification, tab]);

  if (!open) return null;

  const copyUrl = async (site: Pick<AccountSite, 'id' | 'publicUrl'>) => {
    if (!site.publicUrl) return;
    try {
      await navigator.clipboard.writeText(site.publicUrl);
      setCopyState(site.id);
      window.setTimeout(
        () => setCopyState((current) => (current === site.id ? null : current)),
        1800,
      );
    } catch {
      setCopyState(null);
    }
  };

  return (
    <div className="lmw-account-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label="Centro de cuenta LMWares"
        aria-modal="true"
        className="lmw-account-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="lmw-account-header">
          <div className="lmw-account-identity">
            <span>{initials(overview?.user.name, overview?.user.email)}</span>
            <div>
              <small>CUENTA LMWARES</small>
              <h2>{overview?.user.name ?? 'Mi cuenta'}</h2>
              <p>{overview?.user.email ?? 'Cargando sesión…'}</p>
            </div>
          </div>
          <button aria-label="Cerrar centro de cuenta" onClick={onClose} type="button">
            Cerrar ×
          </button>
        </header>

        <nav className="lmw-account-tabs" aria-label="Secciones de la cuenta">
          <button
            className={tab === 'notifications' ? 'is-active' : ''}
            onClick={() => setTab('notifications')}
            type="button"
          >
            <span>
              <b>01</b> Notificaciones
            </span>
            {overview?.unreadCount ? <i>{overview.unreadCount}</i> : null}
          </button>
          <button
            className={tab === 'sites' ? 'is-active' : ''}
            onClick={() => setTab('sites')}
            type="button"
          >
            <span>
              <b>02</b> Mis sitios
            </span>
            <i>{(overview?.sites.length ?? 0) + (overview?.commercialIntakes.length ?? 0)}</i>
          </button>
          <button
            className={tab === 'account' ? 'is-active' : ''}
            onClick={() => setTab('account')}
            type="button"
          >
            <span>
              <b>03</b> Perfil
            </span>
          </button>
        </nav>

        <div className="lmw-account-content">
          {loading && !overview ? (
            <AccountState
              title="Cargando tu cuenta…"
              copy="Estamos recuperando sitios y mensajes."
            />
          ) : error && !overview ? (
            <AccountState
              action={
                <button onClick={() => void onReload()} type="button">
                  Reintentar
                </button>
              }
              copy={error}
              title="No pudimos abrir tu cuenta"
            />
          ) : tab === 'notifications' ? (
            <NotificationsPanel
              notifications={overview?.notifications ?? []}
              onMarkAllRead={onMarkAllRead}
              onSelect={setSelectedId}
              selected={selectedNotification}
            />
          ) : tab === 'sites' ? (
            <SitesPanel
              copyState={copyState}
              intakes={overview?.commercialIntakes ?? []}
              onAcceptOffer={onAcceptOffer}
              onCreateStarterDomain={onCreateStarterDomain}
              onCopy={copyUrl}
              onPurchaseStarterDomain={onPurchaseStarterDomain}
              onRemoveStarterDomain={onRemoveStarterDomain}
              onSearchStarterDomains={onSearchStarterDomains}
              sites={overview?.sites ?? []}
            />
          ) : (
            <ProfilePanel onSignOut={onSignOut} overview={overview} />
          )}
        </div>

        <footer className="lmw-account-footer">
          <span>
            <i />
            Datos sincronizados con tu cuenta
          </span>
          <a href="mailto:soporte@lmwares.com">soporte@lmwares.com</a>
        </footer>
      </section>
    </div>
  );
}

function NotificationsPanel({
  notifications,
  onMarkAllRead,
  onSelect,
  selected,
}: {
  notifications: AccountNotification[];
  onMarkAllRead: () => Promise<void>;
  onSelect: (id: string) => void;
  selected: AccountNotification | null;
}) {
  if (!notifications.length) {
    return (
      <section className="lmw-account-panel">
        <AccountPanelHeader
          copy="Publicaciones, ofertas y comprobantes, reunidos en una bandeja vinculada a tu cuenta."
          eyebrow="CENTRO DE ACTIVIDAD"
          index="01"
          metric="0 mensajes"
          title="Notificaciones"
        />
        <AccountState
          copy="Aquí aparecerán las publicaciones, comprobantes y avisos importantes de tus servicios."
          title="Aún no tienes notificaciones"
        />
      </section>
    );
  }

  return (
    <section className="lmw-account-panel lmw-account-panel--notifications">
      <AccountPanelHeader
        copy="Publicaciones, ofertas y comprobantes, reunidos en una bandeja vinculada a tu cuenta."
        eyebrow="CENTRO DE ACTIVIDAD"
        index="01"
        metric={`${notifications.length} ${notifications.length === 1 ? 'mensaje' : 'mensajes'}`}
        title="Notificaciones"
      />
      <div className="lmw-account-notifications">
        <aside className="lmw-account-inbox">
          <header>
            <div>
              <small>BANDEJA</small>
              <b>{notifications.length} mensajes</b>
            </div>
            {notifications.some(({ readAt }) => !readAt) ? (
              <button onClick={() => void onMarkAllRead()} type="button">
                Marcar todo leído
              </button>
            ) : null}
          </header>
          <div>
            {notifications.map((notification) => (
              <button
                className={`${selected?.id === notification.id ? 'is-selected' : ''}${notification.readAt ? '' : ' is-unread'}`}
                key={notification.id}
                onClick={() => onSelect(notification.id)}
                type="button"
              >
                <i />
                <span>
                  <b>{notification.summary}</b>
                  <small>{formatDate(notification.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {selected ? <NotificationReader notification={selected} /> : null}
      </div>
    </section>
  );
}

function NotificationReader({ notification }: { notification: AccountNotification }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!notification.actionUrl) return;
    try {
      await navigator.clipboard.writeText(notification.actionUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="lmw-account-reader">
      <header>
        <small>
          {notification.kind === 'commercial-offer-issued' ? 'OFERTA COMERCIAL' : 'PUBLICACIÓN'}
          {' · '}
          {notification.plan.toUpperCase()}
        </small>
        <h3>{notification.title}</h3>
        <p>{formatDateTime(notification.createdAt)}</p>
      </header>
      <div className="lmw-account-reader__body">
        <strong>{notification.siteName}</strong>
        {notification.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {notification.actionUrl ? (
          <div className="lmw-account-reader__url">
            <small>URL DE TU SITIO</small>
            <b>{notification.actionUrl}</b>
            <div>
              <button onClick={copy} type="button">
                {copied ? 'Copiada ✓' : 'Copiar URL'}
              </button>
              <a href={notification.actionUrl} rel="noreferrer" target="_blank">
                Abrir sitio ↗
              </a>
            </div>
          </div>
        ) : null}
      </div>
      <footer>
        <div>
          <small>REFERENCIA</small>
          <b>{notification.referenceId ?? 'No disponible'}</b>
        </div>
        <div>
          <small>{notification.kind === 'commercial-offer-issued' ? 'CANAL' : 'EMAIL'}</small>
          <b>
            {notification.kind === 'commercial-offer-issued'
              ? 'En tu cuenta'
              : deliveryLabel(notification.deliveryStatus)}
          </b>
        </div>
      </footer>
    </article>
  );
}

function CustomDomainsPanel({
  clientProjectId,
  domains,
  onCreate,
  onRemove,
  workOrderStatus,
}: {
  clientProjectId: string;
  domains: PublicCustomDomain[];
  onCreate: (
    clientProjectId: string,
    input: { hostname: string; type: 'www' | 'app' },
  ) => Promise<CreatePublicCustomDomainResult>;
  onRemove: (clientProjectId: string, domainId: string) => Promise<unknown>;
  workOrderStatus: PublicStarterWorkOrder['status'] | null;
}) {
  const [hostname, setHostname] = useState('');
  const [verification, setVerification] = useState<CreatePublicCustomDomainResult['verification']>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const normalizedHostname = hostname.trim().toLowerCase();
      const type = normalizedHostname.startsWith('www.') ? 'www' : 'app';
      const result = await onCreate(clientProjectId, { hostname: normalizedHostname, type });
      setVerification(result.verification);
      if (result.verification) setHostname('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No pudimos registrar el dominio.');
    } finally {
      setBusy(false);
    }
  };

  const workOrderReady = workOrderStatus === 'ready_to_publish' || workOrderStatus === 'live';
  if (!workOrderReady) return null;

  const remove = async (domain: PublicCustomDomain) => {
    if (!window.confirm(`¿Retirar ${domain.hostname} del proyecto?`)) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove(clientProjectId, domain.id);
      if (verification) setVerification(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No pudimos retirar el dominio.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="lmw-account-domains" aria-label="Dominios personalizados">
      <header>
        <small>DOMINIO PROPIO · LO COMPRAS TÚ</small>
        <strong>¿Ya tienes un dominio? Conéctalo aquí</strong>
        <p>
          Este formulario funciona con o sin mantenimiento: tú compras el dominio con el proveedor
          que prefieras y nosotros montamos el sitio en él. El subdominio LMWares seguirá
          disponible como respaldo mientras configuramos DNS y el certificado.
        </p>
      </header>
      {domains.filter(({ status }) => status !== 'removed').map((domain) => (
        <article key={domain.id}>
          <div>
            <strong>{domain.hostname}</strong>
            <span>{customDomainStatusLabel(domain.status)}</span>
          </div>
          {domain.dnsInstructions.map((instruction) => (
            <code key={`${instruction.type}-${instruction.name}`}>
              {instruction.type} {instruction.name} → {instruction.value}
            </code>
          ))}
          {domain.status === 'pending_verification' ? (
            <small>
              Después de configurar los registros, nuestro equipo confirmará la verificación y el
              certificado. El subdominio LMWares seguirá disponible mientras tanto.
            </small>
          ) : null}
          <button disabled={busy} onClick={() => void remove(domain)} type="button">
            Retirar dominio
          </button>
        </article>
      ))}
      {!domains.some(({ status }) => status !== 'removed') ? (
        <div className="lmw-account-domains__form">
          <input
            aria-label="Hostname personalizado"
            onChange={(event) => setHostname(event.target.value)}
            placeholder="www.tuempresa.com"
            value={hostname}
          />
          <button disabled={busy || !hostname.trim()} onClick={() => void create()} type="button">
            Conectar mi dominio
          </button>
        </div>
      ) : null}
      {verification ? (
        <div className="lmw-account-domains__instructions">
          <strong>Guarda estas instrucciones; el token sólo se muestra una vez.</strong>
          {verification.instructions.map((instruction) => (
            <code key={`${instruction.type}-${instruction.name}`}>
              {instruction.type} {instruction.name} → {instruction.value}
            </code>
          ))}
        </div>
      ) : null}
      {error ? <p className="lmw-account-domains__error">{error}</p> : null}
    </section>
  );
}

function DomainSearchGate({
  clientProject,
  maintenancePlanSelected,
  maintenanceSubscription,
  onPurchase,
  onSearch,
  workOrderStatus,
}: {
  clientProject: PublicStarterClientProject;
  maintenancePlanSelected: 'none' | 'basic' | 'advanced' | null;
  maintenanceSubscription: PublicMaintenanceSubscription | null;
  onPurchase: (
    clientProjectId: string,
    input: { domain: string },
  ) => Promise<CreatePublicCustomDomainResult>;
  onSearch: (
    clientProjectId: string,
    input: { sld: string },
  ) => Promise<PublicDomainAvailability[]>;
  workOrderStatus: PublicStarterWorkOrder['status'] | null;
}) {
  const hasActiveApexDomain = clientProject.customDomains.some(
    (domain) => domain.type === 'apex' && domain.status !== 'removed',
  );
  if (hasActiveApexDomain) return null;

  const workOrderReady =
    workOrderStatus === 'ready_to_publish' || workOrderStatus === 'live';
  const maintenanceSelected =
    maintenancePlanSelected === 'basic' || maintenancePlanSelected === 'advanced';

  if (!workOrderReady) return null;

  if (!maintenanceSelected) {
    return (
      <section className="lmw-account-domains" aria-label="Dominio propio comprado">
        <header>
          <small>DOMINIO PROPIO · INCLUIDO CON MANTENIMIENTO</small>
          <strong>Con mantenimiento, LMWares compra y gestiona un dominio por ti</strong>
          <p>
            Básico y Avanzado incluyen un dominio. Sin mantenimiento no se incluye: cómpralo con
            tu proveedor y usa el formulario de arriba para que montemos el sitio en él.
          </p>
        </header>
      </section>
    );
  }

  if (maintenanceSubscription?.status !== 'active') {
    return (
      <section className="lmw-account-domains" aria-label="Dominio incluido pendiente de autorización">
        <header>
          <small>DOMINIO PROPIO · INCLUIDO EN TU MANTENIMIENTO</small>
          <strong>Autoriza tu mensualidad para elegir el dominio incluido</strong>
          <p>
            El dominio se registra sin un cobro adicional cuando Mercado Pago confirme tu
            mantenimiento Básico o Avanzado. Mientras tanto, también puedes conectar un dominio
            que ya compraste en el formulario de arriba.
          </p>
        </header>
      </section>
    );
  }

  return (
    <DomainSearchPanel
      clientProjectId={clientProject.id}
      onPurchase={onPurchase}
      onSearch={onSearch}
    />
  );
}

const KNOWN_DOMAIN_TLDS = ['com.mx', 'com', 'mx', 'net'];

/**
 * Acepta lo que el cliente escriba (con o sin "www.", protocolo o extensión)
 * y devuelve sólo el nombre (SLD) que espera el backend, ej.
 * "https://www.tuempresa.com" -> "tuempresa".
 */
function normalizeSldInput(value: string): string {
  let candidate = value.trim().toLowerCase();
  if (!candidate) return '';
  candidate = candidate.replace(/^[a-z]+:\/\//, '');
  candidate = candidate.split('/')[0] ?? candidate;
  candidate = candidate.replace(/^www\./, '');
  const tld = [...KNOWN_DOMAIN_TLDS]
    .sort((a, b) => b.length - a.length)
    .find((candidateTld) => candidate.endsWith(`.${candidateTld}`));
  if (tld) candidate = candidate.slice(0, candidate.length - tld.length - 1);
  return candidate;
}

function DomainSearchPanel({
  clientProjectId,
  onPurchase,
  onSearch,
}: {
  clientProjectId: string;
  onPurchase: (
    clientProjectId: string,
    input: { domain: string },
  ) => Promise<CreatePublicCustomDomainResult>;
  onSearch: (
    clientProjectId: string,
    input: { sld: string },
  ) => Promise<PublicDomainAvailability[]>;
}) {
  const [sld, setSld] = useState('');
  const [results, setResults] = useState<PublicDomainAvailability[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [purchasingDomain, setPurchasingDomain] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<CreatePublicCustomDomainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<PublicDomainAvailability | null>(null);
  const [confirmAccepted, setConfirmAccepted] = useState(false);
  const requestRef = useRef(0);

  const search = async () => {
    const query = normalizeSldInput(sld);
    if (!query) return;
    const requestId = ++requestRef.current;
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const found = await onSearch(clientProjectId, { sld: query });
      if (requestRef.current === requestId) setResults(found);
    } catch (searchError) {
      if (requestRef.current === requestId) {
        setError(
          searchError instanceof Error ? searchError.message : 'No pudimos buscar ese dominio.',
        );
      }
    } finally {
      if (requestRef.current === requestId) setSearching(false);
    }
  };

  const openConfirm = (result: PublicDomainAvailability) => {
    setConfirmTarget(result);
    setConfirmAccepted(false);
    setError(null);
  };

  const purchase = async () => {
    if (!confirmTarget || !confirmAccepted) return;
    const domain = confirmTarget.domain;
    setPurchasingDomain(domain);
    setError(null);
    try {
      const result = await onPurchase(clientProjectId, { domain });
      setPurchased(result);
      setResults(null);
      setSld('');
      setConfirmTarget(null);
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error ? purchaseError.message : 'No pudimos comprar ese dominio.',
      );
    } finally {
      setPurchasingDomain(null);
    }
  };

  if (purchased) {
    return (
      <section className="lmw-account-domains" aria-label="Dominio propio comprado">
        <header>
          <small>DOMINIO PROPIO · DOMINIO INCLUIDO</small>
          <strong>{purchased.domain.hostname}</strong>
          <p>
            Estamos configurando el DNS y esperando la verificación de Cloudflare
            automáticamente. Estado actual: {customDomainStatusLabel(purchased.domain.status)}. No
            necesitas copiar ni pegar nada — el subdominio LMWares sigue disponible mientras tanto.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="lmw-account-domains" aria-label="Buscar y comprar dominio propio">
      <header>
          <small>DOMINIO PROPIO · INCLUIDO EN TU MANTENIMIENTO</small>
        <strong>¿Aún no tienes un dominio? Búscalo aquí</strong>
        <p>
          Escribe sólo el nombre, sin "www." ni extensión (ej. "tuempresa", no "www.tuempresa.com")
          y buscaremos disponibilidad en .com, .mx, .com.mx y .net. Si pegas la versión completa te
          la ajustamos automáticamente. Elige una opción disponible y configuraremos DNS, verificación y
          activación.
        </p>
      </header>
      <div className="lmw-account-domains__form">
        <input
          aria-label="Nombre de dominio a buscar"
          onChange={(event) => setSld(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
          placeholder="tuempresa"
          value={sld}
        />
        <button disabled={searching || !sld.trim()} onClick={() => void search()} type="button">
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {searching ? (
        <p className="lmw-account-domains__searching" role="status" aria-live="polite">
          <span className="lmw-spinner" aria-hidden="true" />
          Buscando disponibilidad… puede tardar hasta un minuto, estamos consultando varias
          extensiones a la vez.
        </p>
      ) : null}
      {results ? (
        results.length === 0 ? (
          <small>No encontramos opciones para ese nombre.</small>
        ) : (
          <ul className="lmw-account-domains__results">
            {results.map((result) => (
              <li key={result.domain}>
                <span>{result.domain}</span>
                {result.available ? (
                  <>
                    <span>
                      Incluido
                    </span>
                    <button
                      disabled={purchasingDomain !== null}
                      onClick={() => openConfirm(result)}
                      type="button"
                    >
                      Elegir y conectar
                    </button>
                  </>
                ) : (
                  <span>Ocupado</span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {error && !confirmTarget ? <p className="lmw-account-domains__error">{error}</p> : null}
      {confirmTarget ? (
        <div className="lmw-account-domains__confirm-overlay" role="dialog" aria-modal="true">
          <div className="lmw-account-domains__confirm">
            <strong>Confirma el dominio incluido: {confirmTarget.domain}</strong>
            <p>
              No tiene un cobro adicional: está incluido en tu mantenimiento. Una vez registrado,
              <strong> este dominio no podrá cambiarse tú mismo</strong>. Si
              después necesitas otro dominio, deberás contactar a soporte y solicitar el cambio,
              con un costo extra que se añadirá a tu mensualidad.
            </p>
            <label className="lmw-account-domains__confirm-check">
              <input
                checked={confirmAccepted}
                onChange={(event) => setConfirmAccepted(event.target.checked)}
                type="checkbox"
              />
              Entiendo y acepto estas condiciones.
            </label>
            {error ? <p className="lmw-account-domains__error">{error}</p> : null}
            <div className="lmw-account-domains__confirm-actions">
              <button
                disabled={purchasingDomain !== null}
                onClick={() => setConfirmTarget(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                disabled={!confirmAccepted || purchasingDomain !== null}
                onClick={() => void purchase()}
                type="button"
              >
                {purchasingDomain === confirmTarget.domain
                  ? 'Configurando…'
                  : 'Confirmar dominio'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SitesPanel({
  copyState,
  intakes,
  onAcceptOffer,
  onCreateStarterDomain,
  onCopy,
  onPurchaseStarterDomain,
  onRemoveStarterDomain,
  onSearchStarterDomains,
  sites,
}: {
  copyState: string | null;
  intakes: PublicPackageIntake[];
  onAcceptOffer: (intakeId: string, offerId: string, termsVersion: string) => Promise<void>;
  onCreateStarterDomain: (
    clientProjectId: string,
    input: { hostname: string; type: 'www' | 'app' },
  ) => Promise<CreatePublicCustomDomainResult>;
  onCopy: (site: AccountSite) => Promise<void>;
  onPurchaseStarterDomain: (
    clientProjectId: string,
    input: { domain: string },
  ) => Promise<CreatePublicCustomDomainResult>;
  onRemoveStarterDomain: (clientProjectId: string, domainId: string) => Promise<unknown>;
  onSearchStarterDomains: (
    clientProjectId: string,
    input: { sld: string },
  ) => Promise<PublicDomainAvailability[]>;
  sites: AccountSite[];
}) {
  const [acceptedTerms, setAcceptedTerms] = useState<Record<string, boolean>>({});
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);

  const acceptOffer = async (intake: PublicPackageIntake) => {
    const offer = intake.currentOffer;
    if (!offer || !acceptedTerms[offer.id]) return;
    setAcceptingOfferId(offer.id);
    setOfferError(null);
    try {
      await onAcceptOffer(intake.id, offer.id, offer.termsVersion);
    } catch (error) {
      setOfferError(error instanceof Error ? error.message : 'No pudimos aceptar la oferta.');
    } finally {
      setAcceptingOfferId(null);
    }
  };

  if (!sites.length && !intakes.length) {
    return (
      <AccountState
        copy="Cuando envíes una solicitud Free, su progreso y URL aparecerán en este espacio."
        title="Aún no has creado sitios"
      />
    );
  }

  return (
    <section className="lmw-account-panel lmw-account-sites">
      <AccountPanelHeader
        copy="Consulta solicitudes, ofertas, publicaciones y accesos de cada proyecto desde un solo lugar."
        eyebrow="PROYECTOS DE TU CUENTA"
        index="02"
        metric={`${sites.length + intakes.length} proyectos registrados`}
        title="Mis sitios"
      />
      {intakes.length ? (
        <section className="lmw-account-intakes" aria-label="Solicitudes comerciales">
          <header>
            <small>STARTER / PRO · REVISIÓN HUMANA</small>
            <h4>Solicitudes comerciales</h4>
          </header>
          <div>
            {intakes.map((intake) => (
              <article key={intake.id}>
                <header>
                  <span>{intake.plan.toUpperCase()}</span>
                  <i>{commercialIntakeStatus(intake.status)}</i>
                </header>
                <div className="lmw-account-intake-visual" aria-label="Módulos solicitados">
                  {intake.modules.slice(0, 4).map((module) => {
                    const presentation = MODULE_PRESENTATION[module];
                    return presentation ? (
                      <figure key={module}>
                        <img
                          alt={`Referencia visual de ${presentation.label}`}
                          src={presentation.visual}
                        />
                        <figcaption>{presentation.label}</figcaption>
                      </figure>
                    ) : null;
                  })}
                </div>
                <div
                  className="lmw-account-intake-progress"
                  aria-label={`Estado: ${commercialIntakeStatus(intake.status)}`}
                >
                  {['Solicitud', 'Revisión', 'Oferta', 'Proyecto'].map((label, index) => (
                    <span
                      className={
                        index < commercialIntakeProgress(intake.status) ? 'is-complete' : ''
                      }
                      key={label}
                    >
                      <i />
                      {label}
                    </span>
                  ))}
                </div>
                <h4>{intake.modules.length} capacidades seleccionadas</h4>
                <p>
                  {intake.modules
                    .map((module) => MODULE_PRESENTATION[module]?.label ?? module)
                    .join(' · ')}
                </p>
                <dl>
                  <div>
                    <dt>Implementación estimada</dt>
                    <dd>{formatMoney(intake.estimatedImplementationCents, intake.currency)}</dd>
                  </div>
                  <div>
                    <dt>Mantenimiento opcional estimado</dt>
                    <dd>Desde {formatMoney(intake.estimatedMonthlyCents, intake.currency)}/mes</dd>
                  </div>
                </dl>
                {intake.currentOffer ? (
                  <section className="lmw-account-offer">
                    <header>
                      <small>OFERTA FINAL · V{intake.currentOffer.version}</small>
                      <b>
                        {intake.currentOffer.status === 'accepted'
                          ? 'Aceptada'
                          : 'Lista para revisar'}
                      </b>
                    </header>
                    <h5>{intake.currentOffer.scopeSummary}</h5>
                    <dl>
                      <div>
                        <dt>Implementación final</dt>
                        <dd>
                          {formatMoney(
                            intake.currentOffer.implementationAmountCents,
                            intake.currentOffer.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Mantenimiento acordado</dt>
                        <dd>
                          {intake.currentOffer.monthlyAmountCents === 0
                            ? 'No contratado'
                            : `${formatMoney(intake.currentOffer.monthlyAmountCents, intake.currentOffer.currency)}/mes`}
                        </dd>
                      </div>
                    </dl>
                    <div className="lmw-account-offer__descriptions">
                      {formatOfferText(intake.currentOffer.implementationDescription)}
                      {formatOfferText(intake.currentOffer.recurringDescription)}
                    </div>
                    <ul>
                      <li>{intake.currentOffer.terms.implementationPayment}</li>
                      <li>{intake.currentOffer.terms.recurringStart}</li>
                      <li>{intake.currentOffer.terms.initialHosting}</li>
                      <li>{intake.currentOffer.terms.cancellation}</li>
                    </ul>
                    <small>Válida hasta {formatDate(intake.currentOffer.validUntil)}</small>
                    {intake.currentOffer.status === 'issued' ? (
                      <div className="lmw-account-offer__accept">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(acceptedTerms[intake.currentOffer.id])}
                            onChange={(event) =>
                              setAcceptedTerms((current) => ({
                                ...current,
                                [intake.currentOffer!.id]: event.target.checked,
                              }))
                            }
                          />
                          Revisé el alcance, los importes y acepto esta versión de los términos.
                        </label>
                        <button
                          disabled={
                            !acceptedTerms[intake.currentOffer.id] ||
                            acceptingOfferId === intake.currentOffer.id
                          }
                          onClick={() => void acceptOffer(intake)}
                          type="button"
                        >
                          {acceptingOfferId === intake.currentOffer.id
                            ? 'Aceptando…'
                            : 'Aceptar oferta'}
                        </button>
                      </div>
                    ) : (
                      <div className="lmw-account-offer__accept">
                        {(() => {
                          const phases = intake.implementationPhases
                            .slice()
                            .sort((a, b) => a.phase - b.phase);
                          const paidCount = phases.filter(
                            (phase) => phase.status === 'paid',
                          ).length;
                          const allPaid = phases.length > 0 && paidCount === phases.length;
                          const phase1 = phases.find((p) => p.phase === 1);
                          const isPhase1Paid = phase1?.status === 'paid';

                          return (
                            <div className="lmw-account-offer__phases-wrapper">
                              <div className="lmw-account-offer__summary-status">
                                <strong className={allPaid ? 'is-complete' : 'is-pending'}>
                                  {allPaid
                                    ? '✓ Pago de implementación completado (4/4 fases).'
                                    : `Oferta aceptada · Fases pagadas: ${paidCount}/4`}
                                </strong>
                                {!isPhase1Paid && (
                                  <p className="lmw-account-offer__phase1-callout">
                                    <b>Atención:</b> Debes realizar el pago de la <b>Fase 1</b> para
                                    iniciar la construcción del proyecto.
                                  </p>
                                )}
                              </div>

                              {phases.length ? (
                                <div className="lmw-account-offer__phase-cards">
                                  {phases.map((phase) => {
                                    const isPaid = phase.status === 'paid';
                                    const isPhase1 = phase.phase === 1;

                                    return (
                                      <div
                                        key={phase.id}
                                        className={`lmw-account-phase-card ${
                                          isPaid
                                            ? 'is-paid'
                                            : isPhase1
                                              ? 'is-phase1-required'
                                              : 'is-optional'
                                        }`}
                                      >
                                        <div className="lmw-account-phase-card__header">
                                          <span className="lmw-account-phase-card__number">
                                            FASE {phase.phase} DE 4
                                          </span>
                                          <span
                                            className={`lmw-account-phase-card__badge ${isPaid ? 'badge-paid' : isPhase1 ? 'badge-required' : 'badge-optional'}`}
                                          >
                                            {isPaid
                                              ? '✓ Pagada'
                                              : isPhase1
                                                ? 'Requerida para iniciar'
                                                : 'Opcional adelantar'}
                                          </span>
                                        </div>

                                        <div className="lmw-account-phase-card__amount">
                                          {formatMoney(phase.amountCents, phase.currency)}
                                        </div>

                                        {isPaid ? (
                                          <a
                                            className="lmw-account-phase-card__btn btn-paid"
                                            href={`/pago/implementacion/${encodeURIComponent(phase.id)}`}
                                          >
                                            Ver comprobación ✓
                                          </a>
                                        ) : isPhase1 ? (
                                          <a
                                            className="lmw-account-phase-card__btn btn-primary-pay"
                                            href={`/pago/implementacion/${encodeURIComponent(phase.id)}`}
                                          >
                                            PAGAR FASE 1 PARA INICIAR PROYECTO →
                                          </a>
                                        ) : (
                                          <a
                                            className="lmw-account-phase-card__btn btn-secondary-pay"
                                            href={`/pago/implementacion/${encodeURIComponent(phase.id)}`}
                                          >
                                            Adelantar pago Fase {phase.phase} →
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                        {intake.clientProject ? (
                          <div className="lmw-account-project-callout">
                            <strong>Proyecto reservado desde la Fase 1</strong>
                            <span>{intake.clientProject.siteName}</span>
                            <small>
                              {intake.clientProject.slug}.lmwares.com ·{' '}
                              {clientProjectStatusLabel(intake.clientProject.status)}
                            </small>
                            <CustomDomainsPanel
                              clientProjectId={intake.clientProject.id}
                              domains={intake.clientProject.customDomains}
                              onCreate={onCreateStarterDomain}
                              onRemove={onRemoveStarterDomain}
                              workOrderStatus={intake.workOrder?.status ?? null}
                            />
                            <DomainSearchGate
                              clientProject={intake.clientProject}
                              maintenancePlanSelected={intake.currentOffer?.maintenancePlanSelected ?? null}
                              maintenanceSubscription={intake.maintenanceSubscription}
                              onPurchase={onPurchaseStarterDomain}
                              onSearch={onSearchStarterDomains}
                              workOrderStatus={intake.workOrder?.status ?? null}
                            />
                          </div>
                        ) : null}
                        {(intake.currentOffer.monthlyAmountCents > 0 ||
                          intake.currentOffer.maintenancePlanSelected === null) &&
                        intake.workOrder &&
                        (intake.workOrder.status === 'ready_to_publish' ||
                          intake.maintenanceSubscription) ? (
                          <a href={`/suscripcion/${encodeURIComponent(intake.workOrder.id)}`}>
                            {intake.currentOffer.maintenancePlanSelected === null
                              ? 'Elige tu plan de mantenimiento →'
                              : `${maintenanceActionLabel(
                                  intake.maintenanceSubscription?.status ?? null,
                                  true,
                                )} →`}
                          </a>
                        ) : null}
                        {intake.currentOffer.maintenancePlanSelected === 'none' &&
                        intake.workOrder?.status === 'ready_to_publish' ? (
                          <strong className="lmw-account-offer__accepted">
                            Pago único confirmado. El proyecto puede publicarse sin autorizar
                            mensualidad.
                          </strong>
                        ) : null}
                        {intake.workOrder?.status === 'live' && intake.workOrder.publishedUrl ? (
                          <a href={intake.workOrder.publishedUrl} rel="noreferrer" target="_blank">
                            Abrir sitio publicado ↗
                          </a>
                        ) : null}
                      </div>
                    )}
                  </section>
                ) : null}
                <footer>
                  <span>
                    {intake.currentOffer?.monthlyAmountCents === 0
                      ? 'Pago único · sin mantenimiento mensual'
                      : 'Mensualidad desde la publicación'}{' '}
                    · Ref. {intake.id.slice(0, 8)}
                  </span>
                </footer>
              </article>
            ))}
          </div>
          {offerError ? <p className="lmw-account-offer-error">{offerError}</p> : null}
        </section>
      ) : null}
      <div className="lmw-account-sites__grid">
        {sites.map((site) => (
          <article key={site.id}>
            <header>
              <span>{site.plan.toUpperCase()}</span>
              <i className={site.publicUrl ? 'is-live' : ''}>
                {SITE_STATUS_LABELS[site.status] ?? site.status}
              </i>
            </header>
            <div className="lmw-account-sites__card-body">
              <div className="lmw-account-sites__details">
                <h4>{site.siteName}</h4>
                <p>{site.publicUrl ?? `${site.slug}.lmwares.com`}</p>
                <dl>
                  <div>
                    <dt>Creado</dt>
                    <dd>{formatDate(site.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Publicado</dt>
                    <dd>{site.publishedAt ? formatDate(site.publishedAt) : 'En proceso'}</dd>
                  </div>
                </dl>
              </div>
              {site.publicUrl ? <SiteQrCode site={site} /> : null}
            </div>
            <footer>
              {site.publicUrl ? (
                <>
                  <button onClick={() => void onCopy(site)} type="button">
                    {copyState === site.id ? 'Copiada ✓' : 'Copiar URL'}
                  </button>
                  <a href={site.publicUrl} rel="noreferrer" target="_blank">
                    Abrir ↗
                  </a>
                </>
              ) : (
                <span>Procesando solicitud…</span>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function SiteQrCode({ site }: { site: AccountSite }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const publicUrl = site.publicUrl;
    if (!publicUrl) return;
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    void import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(publicUrl, {
          color: {
            dark: '#07182fff',
            light: '#ffffffff',
          },
          errorCorrectionLevel: 'M',
          margin: 4,
          type: 'image/png',
          width: 768,
        }),
      )
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [site.publicUrl]);

  return (
    <aside className="lmw-account-site-qr" aria-label={`Código QR de ${site.siteName}`}>
      <small>QR DEL SITIO</small>
      <div className={dataUrl ? 'is-ready' : ''}>
        {dataUrl ? (
          <img
            alt={`Código QR para abrir ${site.siteName}`}
            height="768"
            src={dataUrl}
            width="768"
          />
        ) : (
          <span>{failed ? 'QR no disponible' : 'Generando…'}</span>
        )}
      </div>
      {dataUrl ? (
        <a download={`${safeDownloadName(site.slug)}-qr.png`} href={dataUrl}>
          Descargar QR
        </a>
      ) : null}
    </aside>
  );
}

function safeDownloadName(slug: string): string {
  return (
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sitio-lmwares'
  );
}

function commercialIntakeStatus(status: PublicPackageIntake['status']): string {
  const labels: Record<PublicPackageIntake['status'], string> = {
    submitted: 'Recibida',
    scope_review: 'En revisión',
    offer_ready: 'Propuesta lista',
    declined: 'No aprobada',
    converted: 'Aceptada',
  };
  return labels[status];
}

function clientProjectStatusLabel(status: 'provisioning' | 'active' | 'archived'): string {
  const labels: Record<typeof status, string> = {
    provisioning: 'Preparando',
    active: 'Activo',
    archived: 'Archivado',
  };
  return labels[status];
}

function customDomainStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    pending_verification: 'Pendiente de DNS',
    verified: 'DNS verificado',
    provisioning: 'Configurando',
    active: 'Activo',
    failed: 'Requiere atención',
    removed: 'Retirado',
  };
  return labels[status] ?? status;
}

function commercialIntakeProgress(status: PublicPackageIntake['status']): number {
  const progress: Record<PublicPackageIntake['status'], number> = {
    submitted: 1,
    scope_review: 2,
    offer_ready: 3,
    declined: 1,
    converted: 4,
  };
  return progress[status];
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('es-MX', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amountCents / 100);
}

function ProfilePanel({
  onSignOut,
  overview,
}: {
  onSignOut: () => Promise<void>;
  overview: AccountOverview | null;
}) {
  return (
    <section className="lmw-account-panel lmw-account-profile">
      <AccountPanelHeader
        copy="Tu identidad de acceso, actividad registrada y canales de soporte de LMWares."
        eyebrow="CUENTA Y CONTROL"
        index="03"
        metric="Google OIDC"
        title="Perfil"
      />
      <div className="lmw-account-profile__card">
        <span>{initials(overview?.user.name, overview?.user.email)}</span>
        <div>
          <small>PERFIL ACTIVO</small>
          <h3>{overview?.user.name ?? 'Cuenta LMWares'}</h3>
          <p>{overview?.user.email}</p>
        </div>
      </div>
      <div className="lmw-account-profile__metrics">
        <article>
          <small>PROYECTOS</small>
          <strong>
            {(overview?.sites.length ?? 0) + (overview?.commercialIntakes.length ?? 0)}
          </strong>
          <p>Sitios y solicitudes asociados a tu cuenta.</p>
        </article>
        <article>
          <small>MENSAJES</small>
          <strong>{overview?.notifications.length ?? 0}</strong>
          <p>Confirmaciones e información operativa.</p>
        </article>
        <article>
          <small>PENDIENTES</small>
          <strong>{overview?.unreadCount ?? 0}</strong>
          <p>Notificaciones aún no leídas.</p>
        </article>
      </div>
      <div className="lmw-account-profile__help">
        <div>
          <small>SOPORTE Y CONTROL</small>
          <h4>¿Necesitas corregir o retirar una página?</h4>
          <p>Escríbenos desde el correo de esta cuenta e incluye la referencia del sitio.</p>
        </div>
        <a href="mailto:soporte@lmwares.com">Contactar soporte</a>
      </div>
      <button className="lmw-account-signout" onClick={() => void onSignOut()} type="button">
        Cerrar sesión
      </button>
    </section>
  );
}

function AccountPanelHeader({
  copy,
  eyebrow,
  index,
  metric,
  title,
}: {
  copy: string;
  eyebrow: string;
  index: string;
  metric: string;
  title: string;
}) {
  return (
    <header className="lmw-account-panel__header">
      <span aria-hidden="true">{index}</span>
      <div>
        <small>{eyebrow}</small>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <strong>{metric}</strong>
    </header>
  );
}

function AccountState({
  action,
  copy,
  title,
}: {
  action?: React.ReactNode;
  copy: string;
  title: string;
}) {
  return (
    <section className="lmw-account-empty">
      <i />
      <h3>{title}</h3>
      <p>{copy}</p>
      {action}
    </section>
  );
}

function initials(name: string | null | undefined, email: string | null | undefined) {
  return (name ?? email ?? 'LM')
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function deliveryLabel(status: string) {
  if (status === 'sent') return 'Enviado';
  if (status === 'failed') return 'Entrega pendiente';
  return 'Procesando';
}

function formatOfferText(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  const paragraphs = text.split('\n\n').filter(Boolean);
  return paragraphs.map((para, i) => {
    const parts = para.split(/(\*\*.*?\*\*)/g);
    return (
      <p key={i}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
      </p>
    );
  });
}
