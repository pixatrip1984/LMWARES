import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccountNotification,
  AccountOverview,
  AccountSite,
  PublicPackageIntake,
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
  onMarkAllRead: () => Promise<void>;
  onMarkRead: (notificationId: string) => Promise<void>;
  onReload: () => Promise<void>;
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
  landing: { label: 'Landing', visual: '/assets/package-builder/landing-consulting.png' },
  panel: { label: 'Panel', visual: '/assets/package-builder/panel.png' },
  blog: { label: 'Blog', visual: '/assets/package-builder/blog-frontier-lab.png' },
  galleries: { label: 'Galerías', visual: '/assets/package-builder/galleries-paintings.png' },
  catalog: { label: 'Catálogo', visual: '/assets/package-builder/catalog.png' },
  quote: { label: 'Formulario', visual: '/assets/package-builder/formulario.png' },
  events: { label: 'Eventos', visual: '/assets/package-builder/events.png' },
  docs: { label: 'Docs', visual: '/assets/package-builder/docs.png' },
};

export function AccountCenterModal({
  error,
  initialTab,
  loading,
  onClose,
  onAcceptOffer,
  onMarkAllRead,
  onMarkRead,
  onReload,
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
      overview?.notifications.find(({ id }) => id === selectedId)
      ?? overview?.notifications[0]
      ?? null,
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
      window.setTimeout(() => setCopyState((current) => current === site.id ? null : current), 1800);
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
            <span><b>01</b> Notificaciones</span>
            {overview?.unreadCount ? <i>{overview.unreadCount}</i> : null}
          </button>
          <button
            className={tab === 'sites' ? 'is-active' : ''}
            onClick={() => setTab('sites')}
            type="button"
          >
            <span><b>02</b> Mis sitios</span>
            <i>{(overview?.sites.length ?? 0) + (overview?.commercialIntakes.length ?? 0)}</i>
          </button>
          <button
            className={tab === 'account' ? 'is-active' : ''}
            onClick={() => setTab('account')}
            type="button"
          >
            <span><b>03</b> Perfil</span>
          </button>
        </nav>

        <div className="lmw-account-content">
          {loading && !overview ? (
            <AccountState title="Cargando tu cuenta…" copy="Estamos recuperando sitios y mensajes." />
          ) : error && !overview ? (
            <AccountState
              action={<button onClick={() => void onReload()} type="button">Reintentar</button>}
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
              onCopy={copyUrl}
              sites={overview?.sites ?? []}
            />
          ) : (
            <ProfilePanel
              onSignOut={onSignOut}
              overview={overview}
            />
          )}
        </div>

        <footer className="lmw-account-footer">
          <span><i />Datos sincronizados con tu cuenta</span>
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
          <div><small>BANDEJA</small><b>{notifications.length} mensajes</b></div>
          {notifications.some(({ readAt }) => !readAt) ? (
            <button onClick={() => void onMarkAllRead()} type="button">Marcar todo leído</button>
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
          {' · '}{notification.plan.toUpperCase()}
        </small>
        <h3>{notification.title}</h3>
        <p>{formatDateTime(notification.createdAt)}</p>
      </header>
      <div className="lmw-account-reader__body">
        <strong>{notification.siteName}</strong>
        {notification.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {notification.actionUrl ? (
          <div className="lmw-account-reader__url">
            <small>URL DE TU SITIO</small>
            <b>{notification.actionUrl}</b>
            <div>
              <button onClick={copy} type="button">{copied ? 'Copiada ✓' : 'Copiar URL'}</button>
              <a href={notification.actionUrl} rel="noreferrer" target="_blank">Abrir sitio ↗</a>
            </div>
          </div>
        ) : null}
      </div>
      <footer>
        <div><small>REFERENCIA</small><b>{notification.referenceId ?? 'No disponible'}</b></div>
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

function SitesPanel({
  copyState,
  intakes,
  onAcceptOffer,
  onCopy,
  sites,
}: {
  copyState: string | null;
  intakes: PublicPackageIntake[];
  onAcceptOffer: (intakeId: string, offerId: string, termsVersion: string) => Promise<void>;
  onCopy: (site: AccountSite) => Promise<void>;
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
                        <img alt={`Referencia visual de ${presentation.label}`} src={presentation.visual} />
                        <figcaption>{presentation.label}</figcaption>
                      </figure>
                    ) : null;
                  })}
                </div>
                <div className="lmw-account-intake-progress" aria-label={`Estado: ${commercialIntakeStatus(intake.status)}`}>
                  {['Solicitud', 'Revisión', 'Oferta', 'Proyecto'].map((label, index) => (
                    <span className={index < commercialIntakeProgress(intake.status) ? 'is-complete' : ''} key={label}>
                      <i />{label}
                    </span>
                  ))}
                </div>
                <h4>{intake.modules.length} capacidades seleccionadas</h4>
                <p>{intake.modules.map((module) => MODULE_PRESENTATION[module]?.label ?? module).join(' · ')}</p>
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
                      <b>{intake.currentOffer.status === 'accepted' ? 'Aceptada' : 'Lista para revisar'}</b>
                    </header>
                    <h5>{intake.currentOffer.scopeSummary}</h5>
                    <dl>
                      <div>
                        <dt>Implementación final</dt>
                        <dd>{formatMoney(intake.currentOffer.implementationAmountCents, intake.currentOffer.currency)}</dd>
                      </div>
                      <div>
                        <dt>Mantenimiento acordado</dt>
                        <dd>{intake.currentOffer.monthlyAmountCents === 0
                          ? 'No contratado'
                          : `${formatMoney(intake.currentOffer.monthlyAmountCents, intake.currentOffer.currency)}/mes`}</dd>
                      </div>
                    </dl>
                    <p>{intake.currentOffer.implementationDescription}</p>
                    <p>{intake.currentOffer.recurringDescription}</p>
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
                            onChange={(event) => setAcceptedTerms((current) => ({
                              ...current,
                              [intake.currentOffer!.id]: event.target.checked,
                            }))}
                          />
                          Revisé el alcance, los importes y acepto esta versión de los términos.
                        </label>
                        <button
                          disabled={!acceptedTerms[intake.currentOffer.id] || acceptingOfferId === intake.currentOffer.id}
                          onClick={() => void acceptOffer(intake)}
                          type="button"
                        >
                          {acceptingOfferId === intake.currentOffer.id ? 'Aceptando…' : 'Aceptar oferta'}
                        </button>
                      </div>
                    ) : (
                      <div className="lmw-account-offer__accept">
                        {(() => {
                          const phases = intake.implementationPhases
                            .slice()
                            .sort((a, b) => a.phase - b.phase);
                          const paidCount = phases.filter((phase) => phase.status === 'paid').length;
                          const allPaid = phases.length > 0 && paidCount === phases.length;
                          return (
                            <>
                              <strong className="lmw-account-offer__accepted">
                                {allPaid
                                  ? 'Pago de implementación confirmado (4/4 fases).'
                                  : `Oferta aceptada. Fases de pago: ${paidCount}/${phases.length || 4} confirmadas.`}
                              </strong>
                              {phases.length ? (
                                <ul className="lmw-account-offer__phases">
                                  {phases.map((phase) => (
                                    <li key={phase.id}>
                                      Fase {phase.phase} de 4 · {formatMoney(phase.amountCents, phase.currency)}{' '}
                                      <a href={`/pago/implementacion/${encodeURIComponent(phase.id)}`}>
                                        {phase.status === 'paid' ? 'Ver comprobación' : 'Pagar esta fase (opcional adelantarla)'}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </>
                          );
                        })()}
                        {intake.currentOffer.monthlyAmountCents > 0 && intake.workOrder && (
                          intake.workOrder.status === 'ready_to_publish' || intake.maintenanceSubscription
                        ) ? (
                          <a href={`/suscripcion/${encodeURIComponent(intake.workOrder.id)}`}>
                            {maintenanceActionLabel(intake.maintenanceSubscription?.status ?? null)}
                          </a>
                        ) : null}
                        {intake.currentOffer.monthlyAmountCents === 0 && intake.workOrder?.status === 'ready_to_publish' ? (
                          <strong className="lmw-account-offer__accepted">
                            Pago único confirmado. El proyecto puede publicarse sin autorizar mensualidad.
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
                      : 'Mensualidad desde la publicación'} · Ref. {intake.id.slice(0, 8)}
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
                  <div><dt>Creado</dt><dd>{formatDate(site.createdAt)}</dd></div>
                  <div><dt>Publicado</dt><dd>{site.publishedAt ? formatDate(site.publishedAt) : 'En proceso'}</dd></div>
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
                  <a href={site.publicUrl} rel="noreferrer" target="_blank">Abrir ↗</a>
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
    slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') ||
    'sitio-lmwares'
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
        <article><small>PROYECTOS</small><strong>{(overview?.sites.length ?? 0) + (overview?.commercialIntakes.length ?? 0)}</strong><p>Sitios y solicitudes asociados a tu cuenta.</p></article>
        <article><small>MENSAJES</small><strong>{overview?.notifications.length ?? 0}</strong><p>Confirmaciones e información operativa.</p></article>
        <article><small>PENDIENTES</small><strong>{overview?.unreadCount ?? 0}</strong><p>Notificaciones aún no leídas.</p></article>
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
