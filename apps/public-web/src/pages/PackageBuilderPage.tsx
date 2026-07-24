import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { clearDemoSession, getDemoSession, getProviderName } from '../features/package-builder/demoAuth';
import { PackagePreviewModal } from '../features/package-builder/PackagePreviewModal';
import {
  DEFAULT_DRAFT,
  FOUNDATION_MODULES,
  FREE_IMAGE_LIMIT,
  FREE_IMAGE_MAX_BYTES,
  PACKAGE_MODULES,
  formatFileSize,
  getPackageLabel,
  getPlanSeed,
  loadPackageDraft,
  savePackageDraft,
  togglePackageModule,
  type DraftImage,
  type PackageDraft,
  type PackageModule,
  type PackageModuleId,
  type PlanId,
} from '../features/package-builder/packageBuilderModel';
import './packageBuilder.css';

type BuilderView = 'package' | 'summary';

const PLAN_COPY: Record<PlanId, { name: string; eyebrow: string; description: string }> = {
  free: {
    name: 'Free',
    eyebrow: 'Presencia inicial',
    description: 'Página informativa en un subdominio LMWares.',
  },
  starter: {
    name: 'Starter',
    eyebrow: 'Operación ligera',
    description: 'Subdominio LMWares y dominio personalizado, con Landing, Panel y hasta dos complementos.',
  },
  pro: {
    name: 'Pro',
    eyebrow: 'Capacidad completa',
    description: 'Subdominio LMWares y dominio personalizado, con todas las capacidades disponibles.',
  },
};

const MODULE_IMAGE_PATHS: Record<PackageModuleId, string> = {
  landing: '/assets/package-builder/landing-consulting.png',
  panel: '/assets/package-builder/panel.png',
  blog: '/assets/package-builder/blog-frontier-lab.png',
  galleries: '/assets/package-builder/galleries-paintings.png',
  catalog: '/assets/package-builder/catalog.png',
  quote: '/assets/package-builder/formulario.png?v=20260722',
  events: '/assets/package-builder/events.png',
  docs: '/assets/package-builder/docs.png',
  cart: '/assets/package-builder/cart-premium-checkout.png',
  data: '/assets/package-builder/optimization-model-router.png',
};

export function PackageBuilderPage() {
  const navigate = useNavigate();
  const session = getDemoSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<PackageDraft>(() => loadPackageDraft());
  const [view, setView] = useState<BuilderView>('package');
  const [notice, setNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selectedModules = useMemo(
    () => PACKAGE_MODULES.filter(({ id }) => draft.modules.includes(id)),
    [draft.modules],
  );
  const visibleModules = PACKAGE_MODULES;
  const foundationModules = visibleModules.filter(({ id }) => FOUNDATION_MODULES.includes(id));
  const starterComplements = visibleModules.filter(({ tier }) => tier === 'starter');
  const proCapabilities = visibleModules.filter(({ tier }) => tier === 'pro');
  const selectedComplements = selectedModules.filter(({ id }) => !FOUNDATION_MODULES.includes(id));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTitle = document.title;
    document.body.style.overflow = 'auto';
    document.title = 'Configura tu paquete · LMWares';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.title = previousTitle;
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    savePackageDraft(draft);
  }, [draft]);

  if (!session) return <Navigate replace to="/acceso" />;

  const flashNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 3200);
  };

  const updateDraft = (changes: Partial<PackageDraft>) => {
    setDraft((current) => ({ ...current, ...changes, updatedAt: new Date().toISOString() }));
    setSubmitted(false);
  };

  const selectPlan = (plan: PlanId) => {
    updateDraft({
      plan,
      modules: getPlanSeed(plan),
      marketing: plan === 'free' ? false : draft.marketing,
    });
    setView('package');
    flashNotice(`${PLAN_COPY[plan].name} cargado como punto de partida.`);
  };

  const toggleModule = (moduleId: PackageModuleId) => {
    if (FOUNDATION_MODULES.includes(moduleId)) {
      flashNotice('Landing y Panel ya están incluidos en este plan.');
      return;
    }

    if (draft.plan === 'starter') {
      const module = PACKAGE_MODULES.find(({ id }) => id === moduleId);
      if (module?.tier === 'pro') {
        flashNotice(`${module.name} es una capacidad exclusiva de Pro.`);
        return;
      }

      const currentComplements = draft.modules.filter((id) => !FOUNDATION_MODULES.includes(id));
      if (currentComplements.includes(moduleId)) {
        updateDraft({ modules: [...FOUNDATION_MODULES, ...currentComplements.filter((id) => id !== moduleId)] });
        flashNotice(`${module?.name ?? 'El complemento'} se retiró de Starter.`);
        return;
      }

      if (currentComplements.length >= 2) {
        flashNotice('Starter permite hasta dos complementos. Quita uno antes de añadir otro.');
        return;
      }

      updateDraft({ modules: [...FOUNDATION_MODULES, ...currentComplements, moduleId] });
      flashNotice(`${module?.name ?? 'El complemento'} se añadió a Starter.`);
      return;
    }

    const result = togglePackageModule(draft.modules, moduleId);
    if (result.message) {
      flashNotice(result.message);
      return;
    }

    updateDraft({ modules: result.modules });
  };

  const toggleMarketing = () => {
    const marketing = !draft.marketing;
    updateDraft({ marketing });
  };

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setFileError('');
    if (files.length === 0) return;

    const rejectedType = files.find((file) => !file.type.startsWith('image/'));
    if (rejectedType) {
      setFileError(`${rejectedType.name} no es una imagen válida.`);
      return;
    }

    const rejectedSize = files.find((file) => file.size > FREE_IMAGE_MAX_BYTES);
    if (rejectedSize) {
      setFileError(`${rejectedSize.name} supera el máximo de 5 MB.`);
      return;
    }

    const known = new Set(draft.images.map((image) => `${image.name}:${image.size}`));
    const additions: DraftImage[] = files
      .filter((file) => !known.has(`${file.name}:${file.size}`))
      .map((file, index) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        name: file.name,
        size: file.size,
        type: file.type,
      }));

    if (draft.images.length + additions.length > FREE_IMAGE_LIMIT) {
      setFileError(`El plan Free permite hasta ${FREE_IMAGE_LIMIT} imágenes.`);
      return;
    }

    updateDraft({ images: [...draft.images, ...additions] });
  };

  const removeImage = (imageId: string) => {
    updateDraft({ images: draft.images.filter(({ id }) => id !== imageId) });
  };

  const resetDraft = () => {
    updateDraft({ ...DEFAULT_DRAFT, updatedAt: new Date().toISOString() });
    setView('package');
    setFileError('');
    flashNotice('Restauramos el ejemplo Starter.');
  };

  const signOut = () => {
    clearDemoSession();
    navigate('/acceso');
  };

  const submitDraft = () => {
    setSubmitted(true);
    flashNotice('Evaluación simulada guardada. Aún no se envió a un servidor.');
  };

  const renderModuleCard = (module: PackageModule) => {
    const selected = draft.modules.includes(module.id);
    const included = FOUNDATION_MODULES.includes(module.id);
    const locked = draft.plan === 'starter' && module.tier === 'pro';
    const starterAtLimit = draft.plan === 'starter' && selectedComplements.length >= 2;
    const stateLabel = included
      ? 'Incluido en la base'
      : locked
        ? 'Bloqueado · requiere Pro'
        : draft.plan === 'starter'
          ? selected ? 'Seleccionado · quitar' : starterAtLimit ? 'Límite · quita uno' : 'Añadir complemento'
        : selected ? 'Añadido' : 'Añadir';

    return (
      <button
        aria-pressed={selected}
        aria-disabled={locked}
        className={`lmw-module-card lmw-module-card--${module.tier} lmw-module-card--${module.id}${selected ? ' is-selected' : ''}${included ? ' is-included' : ''}${locked ? ' is-locked' : ''}`}
        disabled={included}
        key={module.id}
        onClick={() => toggleModule(module.id)}
        type="button"
      >
        <span className="lmw-module-media" aria-hidden="true">
          <img alt="" src={MODULE_IMAGE_PATHS[module.id]} />
        </span>
        <span className="lmw-module-copy">
          <small>{module.eyebrow}{module.tier === 'pro' ? ' · PRO' : ''}</small>
          <strong>{module.name}</strong>
          <em>{module.description}</em>
        </span>
        {locked ? <span className="lmw-module-lock" aria-hidden="true">Solo Pro</span> : null}
        <span className="lmw-module-state"><i />{stateLabel}</span>
      </button>
    );
  };

  return (
    <div className="lmw-builder-shell lmw-configurator-shell">
      <div className="lmw-builder-backdrop" aria-hidden="true"><i /><i /><i /></div>

      <header className="lmw-builder-topbar">
        <Link className="lmw-builder-brand" to="/">
          <span>LM</span>WARES<i />
        </Link>

        <ol className="lmw-builder-progress" aria-label="Progreso del configurador">
          {['Acceso', 'Necesidades', 'Paquete', 'Resumen'].map((step, index) => {
            const activeIndex = view === 'summary' ? 3 : 2;
            return (
              <li className={index === activeIndex ? 'is-active' : index < activeIndex ? 'is-done' : ''} key={step}>
                <span>{index < activeIndex ? '✓' : index + 1}</span><b>{step}</b>
              </li>
            );
          })}
        </ol>

        <div className="lmw-builder-account">
          <span>CD</span>
          <b>Cuenta demo<small>{getProviderName(session.provider)}</small></b>
          <button onClick={signOut} type="button">Salir</button>
        </div>
      </header>

      {notice ? <div className="lmw-builder-toast" role="status"><i />{notice}</div> : null}

      {view === 'package' ? (
        <main className="lmw-configurator">
          <header className="lmw-configurator-heading">
            <div>
              <p className="lmw-builder-eyebrow">02 / Configuración</p>
              <h1>Arma tu paquete</h1>
              <span>Primero elige un plan. Después configura únicamente lo que ese plan permite.</span>
            </div>
            <button onClick={resetDraft} type="button">Restaurar ejemplo</button>
          </header>

          <nav className="lmw-plan-rail" aria-label="Comenzar desde un plan">
            {(['free', 'starter', 'pro'] as PlanId[]).map((plan) => (
              <button
                className={draft.plan === plan ? 'is-active' : ''}
                key={plan}
                onClick={() => selectPlan(plan)}
                type="button"
              >
                <span>{plan === 'free' ? '○' : plan === 'starter' ? '★' : '♢'}</span>
                <span className="lmw-plan-rail__copy">
                  <b>{PLAN_COPY[plan].name}</b>
                  <em>{PLAN_COPY[plan].eyebrow}</em>
                </span>
                {draft.plan === plan ? <small>Activo</small> : null}
              </button>
            ))}
          </nav>

          <section className="lmw-configurator-workspace">
            <div className="lmw-plan-context">
              <p className="lmw-builder-eyebrow">{PLAN_COPY[draft.plan].name} / Alcance disponible</p>
              <h2>
                {draft.plan === 'free'
                  ? 'Una presencia simple para comenzar.'
                  : draft.plan === 'starter'
                    ? 'La base está incluida. Elige hasta dos complementos.'
                    : 'Todo está disponible. Activa sólo lo que usarás.'}
              </h2>
            </div>

            {draft.plan === 'free' ? (
              <div className="lmw-free-package">
                <article className="lmw-free-capability">
                  <span className="lmw-free-capability__glyph">▤</span>
                  <div>
                    <small>Incluido en Free</small>
                    <h3>Página informativa</h3>
                    <p>Una página única, clara y publicada temporalmente en un subdominio de LMWares.</p>
                  </div>
                  <ul>
                    <li><b>01</b><span>Una sola página</span></li>
                    <li><b>02</b><span>Hasta 10 imágenes</span></li>
                    <li><b>03</b><span>Máximo 5 MB cada una</span></li>
                  </ul>
                </article>

                <section className="lmw-free-assets">
                  <div>
                    <p className="lmw-builder-eyebrow">Contenido de tu página</p>
                    <h2>Carga las imágenes que quieres utilizar.</h2>
                    <span>En esta fase local sólo guardamos el nombre y tamaño de cada archivo.</span>
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} type="button">
                    Añadir imágenes <b>{draft.images.length}/{FREE_IMAGE_LIMIT}</b>
                  </button>
                  <input
                    accept="image/*"
                    hidden
                    multiple
                    onChange={addImages}
                    ref={fileInputRef}
                    type="file"
                  />
                  {fileError ? <p className="lmw-free-assets__error">{fileError}</p> : null}
                  {draft.images.length > 0 ? (
                    <ul>
                      {draft.images.map((image) => (
                        <li key={image.id}>
                          <span><b>{image.name}</b><small>{formatFileSize(image.size)}</small></span>
                          <button onClick={() => removeImage(image.id)} type="button" aria-label={`Quitar ${image.name}`}>×</button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>
            ) : (
              <div className="lmw-module-sections">
                <section className="lmw-module-group lmw-module-group--foundation">
                  <header>
                    <div>
                      <p className="lmw-builder-eyebrow">Base incluida</p>
                      <h3>Landing + Panel</h3>
                    </div>
                    <span>No tienes que seleccionarlos. Ambos forman parte del plan.</span>
                  </header>
                  <div className="lmw-module-grid lmw-module-grid--foundation">
                    {foundationModules.map(renderModuleCard)}
                  </div>
                </section>

                <section className="lmw-module-group lmw-module-group--choices">
                  <header>
                    <div>
                      <p className="lmw-builder-eyebrow">Personaliza tu alcance</p>
                      <h3>{draft.plan === 'starter' ? 'Elige hasta dos complementos' : 'Elige cualquier combinación'}</h3>
                    </div>
                    <span>
                      {draft.plan === 'starter'
                        ? 'Carrito y Optimization se muestran bloqueados porque requieren Pro.'
                        : 'Activa únicamente las capacidades que utilizarás.'}
                    </span>
                  </header>
                  <div className="lmw-module-grid lmw-module-grid--choices">
                    {starterComplements.map(renderModuleCard)}
                  </div>
                </section>

                <section className="lmw-module-group lmw-module-group--pro">
                  <header>
                    <div>
                      <p className="lmw-builder-eyebrow">Capacidades Pro</p>
                      <h3>Más operación. Más inteligencia.</h3>
                    </div>
                    <span>
                      {draft.plan === 'starter'
                        ? 'Disponibles al cambiar a Pro.'
                        : 'Activa únicamente las capacidades que formarán parte de tu sistema.'}
                    </span>
                  </header>
                  <div className="lmw-module-grid lmw-module-grid--pro">
                    {proCapabilities.map(renderModuleCard)}
                  </div>
                </section>
              </div>
            )}
          </section>

          <aside className={`lmw-recommendation lmw-recommendation--${draft.plan}`}>
            <p><i>{draft.plan === 'starter' ? '★' : draft.plan === 'pro' ? '♢' : '○'}</i> Plan activo</p>
            <h2>{PLAN_COPY[draft.plan].name}</h2>
            <span className="lmw-recommendation__eyebrow">{PLAN_COPY[draft.plan].eyebrow}</span>
            <p className="lmw-recommendation__description">{PLAN_COPY[draft.plan].description}</p>

            <div className="lmw-recommendation__selection">
              {draft.plan === 'free' ? (
                <>
                  <div><i>01</i><span><b>Página informativa</b><small>Única capacidad del plan</small></span></div>
                  <div><i>02</i><span><b>Subdominio LMWares</b><small>Durante esta etapa inicial</small></span></div>
                  <div><i>03</i><span><b>10 imágenes</b><small>Máximo 5 MB por archivo</small></span></div>
                </>
              ) : (
                <>
                  <div><i>01</i><span><b>Landing + Panel</b><small>Base incluida, sin decisiones extra</small></span></div>
                  <div><i>02</i><span><b>Subdominio + dominio propio</b><small>Entorno LMWares y publicación personalizada</small></span></div>
                  <div><i>03</i><span><b>{selectedComplements.length} {selectedComplements.length === 1 ? 'complemento elegido' : 'complementos elegidos'}</b><small>{selectedComplements.length > 0 ? selectedComplements.map(({ name }) => name).join(' · ') : 'Todavía no has añadido ninguno'}</small></span></div>
                  <div><i>04</i><span><b>{draft.plan === 'pro' ? 'Todas las capacidades' : 'Hasta 2 de 6 compatibles'}</b><small>{draft.plan === 'pro' ? 'Incluye Carrito y Optimization' : 'Carrito y Optimization requieren Pro'}</small></span></div>
                </>
              )}
            </div>

            <strong className="lmw-recommendation__label">
              {getPackageLabel(draft.plan, draft.modules)}
            </strong>

            {draft.plan !== 'free' ? (
              <button
                aria-pressed={draft.marketing}
                className={`lmw-marketing-toggle${draft.marketing ? ' is-active' : ''}`}
                onClick={toggleMarketing}
                type="button"
              >
                <i>✦</i>
                <span><b>Añadir marketing Astramuses</b><small>Servicio separado para Starter y Pro</small></span>
                <em><u /></em>
              </button>
            ) : null}

            <button className="lmw-builder-primary" onClick={() => setPreviewOpen(true)} type="button">
              Ver mi sitio <span>↗</span>
            </button>
          </aside>
        </main>
      ) : (
        <main className="lmw-package-summary">
          <section className="lmw-summary-main">
            <p className="lmw-builder-eyebrow">04 / Resumen</p>
            <h1>Tu paquete está listo para evaluación.</h1>
            <p>
              Éste es un borrador operativo. Todavía no genera un cobro, contrato o recurso de
              Cloudflare.
            </p>

            <div className={`lmw-summary-plan lmw-summary-plan--${draft.plan}`}>
              <div>
                <span>Plan elegido</span>
                <strong>{PLAN_COPY[draft.plan].name}</strong>
                <small>{getPackageLabel(draft.plan, draft.modules)}</small>
              </div>
              <i>{draft.plan === 'free' ? '○' : draft.plan === 'starter' ? '★' : '♢'}</i>
            </div>

            <div className="lmw-summary-grid">
              <article>
                <span>ALCANCE</span>
                <h2>{draft.plan === 'free' ? 'Página informativa' : `${selectedModules.length} capacidades`}</h2>
                <ul>
                  {draft.plan === 'free' ? <li>Página única en subdominio LMWares</li> : null}
                  {selectedModules.map((module) => <li key={module.id}>{module.name}</li>)}
                </ul>
              </article>
              <article>
                <span>PUBLICACIÓN</span>
                <h2>{draft.plan === 'free' ? 'tu-negocio.lmwares.com' : 'Subdominio + dominio propio'}</h2>
                <p>
                  {draft.plan === 'free'
                    ? `${draft.images.length}/${FREE_IMAGE_LIMIT} imágenes preparadas.`
                    : 'El subdominio LMWares acompaña el desarrollo; el dominio personalizado se conecta al formalizar el alcance.'}
                </p>
              </article>
              <article className={draft.marketing ? 'is-astra' : ''}>
                <span>MARKETING</span>
                <h2>{draft.marketing ? 'Astramuses añadido' : 'No incluido'}</h2>
                <p>{draft.marketing ? 'Se evaluará como servicio separado.' : 'Puedes añadirlo antes de enviar.'}</p>
              </article>
            </div>

            <div className="lmw-summary-actions">
              <button onClick={() => setView('package')} type="button">← Volver a configurar</button>
              <button className="lmw-builder-primary" onClick={submitDraft} type="button">
                {submitted ? 'Evaluación guardada' : 'Guardar evaluación'} <span>{submitted ? '✓' : '→'}</span>
              </button>
            </div>
          </section>

          <aside className="lmw-summary-next">
            <p className="lmw-builder-eyebrow">Qué ocurre después</p>
            <ol>
              <li><span>01</span><div><b>Revisamos la combinación</b><p>Confirmamos dependencias y evitamos capacidad innecesaria.</p></div></li>
              <li><span>02</span><div><b>Fijamos el alcance</b><p>Contenido, límites, dominio, tiempos y acompañamiento.</p></div></li>
              <li><span>03</span><div><b>Preparamos la propuesta</b><p>Separando implementación, licencia, alojamiento y mantenimiento.</p></div></li>
            </ol>
            <div><i />La simulación no envía datos ni crea recursos externos.</div>
          </aside>
        </main>
      )}

      <PackagePreviewModal
        draft={draft}
        onClose={() => setPreviewOpen(false)}
        onContinue={() => {
          setPreviewOpen(false);
          setView('summary');
        }}
        open={previewOpen}
      />
    </div>
  );
}
