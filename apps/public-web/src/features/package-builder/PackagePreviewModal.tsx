import { useEffect, useMemo, useRef, useState } from 'react';
import type { PackageDraft, PackageModuleId } from './packageBuilderModel';
import './packagePreview.css';

type PackagePreviewModalProps = {
  draft: PackageDraft;
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
};

type PreviewMode = 'public' | 'admin';
type CatalogView = 'list' | 'detail';

type PublicSection = {
  id: string;
  moduleId: PackageModuleId;
  nav: string;
  eyebrow: string;
  title: string;
  copy: string;
  image: string;
  action?: string;
};

type AdminPanel = {
  id: string;
  moduleId?: PackageModuleId;
  nav: string;
  image: string;
  alt: string;
};

const PUBLIC_SECTION_ORDER: PackageModuleId[] = [
  'blog',
  'galleries',
  'catalog',
  'quote',
  'events',
  'cart',
  'docs',
];

const PUBLIC_SECTIONS: Partial<Record<PackageModuleId, PublicSection>> = {
  blog: {
    id: 'blog',
    moduleId: 'blog',
    nav: 'Blog',
    eyebrow: 'Insight',
    title: 'Notas para inversionistas que quieren entender antes de decidir.',
    copy: 'Articulos breves sobre plusvalia, zonas emergentes, regulacion, financiamiento y decisiones patrimoniales.',
    image: '/assets/package-builder/blog-frontier-lab.webp?v=20260805_editorial',
    action: 'Leer articulo',
  },
  galleries: {
    id: 'galerias',
    moduleId: 'galleries',
    nav: 'Galerias',
    eyebrow: 'Portafolio visual',
    title: 'Recorridos, acabados y ambientes organizados como colecciones.',
    copy: 'La galeria permite mostrar renders, avances, obras terminadas o referencias por proyecto y categoria.',
    image: '/assets/package-builder/galleries-paintings.webp?v=20260805_editorial',
    action: 'Ver coleccion',
  },
  catalog: {
    id: 'catalogo',
    moduleId: 'catalog',
    nav: 'Catalogo',
    eyebrow: 'Inventario',
    title: 'Un catalogo navegable con fichas claras y detalle interno.',
    copy: 'Muestra oportunidades, servicios o productos con filtros simples, tarjetas comparables y una pagina de detalle por elemento.',
    image: '/assets/package-builder/catalog.webp?v=20260805_editorial',
  },
  quote: {
    id: 'formulario',
    moduleId: 'quote',
    nav: 'Formulario',
    eyebrow: 'Solicitud',
    title: 'Un formulario directo para recibir solicitudes completas.',
    copy: 'Sirve para cotizaciones, reservaciones, diagnosticos o cualquier entrada estructurada que tu operacion deba revisar.',
    image: '/assets/package-builder/formulario.webp?v=20260805_editorial',
    action: 'Enviar solicitud',
  },
  events: {
    id: 'eventos',
    moduleId: 'events',
    nav: 'Eventos',
    eyebrow: 'Agenda',
    title: 'Eventos publicados con cupo, fecha y llamada a registro.',
    copy: 'Conferencias, demostraciones, aperturas, sesiones privadas o actividades programadas dentro del mismo micrositio.',
    image: '/assets/package-builder/events.webp?v=20260805_editorial',
    action: 'Reservar lugar',
  },
  cart: {
    id: 'carrito',
    moduleId: 'cart',
    nav: 'E-Commerce',
    eyebrow: 'Comercio',
    title: 'Selecciones, pedidos y checkout visual sin salir del sitio.',
    copy: 'Para productos, preventas, apartados o flujos comerciales que necesitan una experiencia transaccional.',
    image: '/assets/package-builder/cart-ecommerce.webp?v=20260806_ecommerce',
    action: 'Ver pedido',
  },
  docs: {
    id: 'docs',
    moduleId: 'docs',
    nav: 'Docs',
    eyebrow: 'Biblioteca',
    title: 'Documentacion clara para explicar procesos, reglas o soporte.',
    copy: 'Centraliza preguntas, manuales, politicas, tutoriales y contenido operativo que el cliente necesita consultar.',
    image: '/assets/package-builder/docs.webp?v=20260805_editorial',
    action: 'Abrir guia',
  },
};

const PUBLIC_CONCEPT_BY_MODULE: Partial<Record<PackageModuleId, string>> = {
  blog: '/assets/package-preview/concepts/public-blog.webp?v=20260805_editorial',
  galleries: '/assets/package-preview/concepts/public-galerias.webp?v=20260805_editorial',
  catalog: '/assets/package-preview/concepts/public-catalogo.webp?v=20260805_editorial',
  quote: '/assets/package-preview/concepts/public-formulario.webp?v=20260805_editorial',
  events: '/assets/package-preview/concepts/public-eventos.webp?v=20260805_editorial',
  cart: '/assets/package-preview/concepts/public-carrito.webp?v=20260805_editorial',
  docs: '/assets/package-preview/concepts/public-docs.webp?v=20260805_editorial',
};

const ADMIN_PANEL_ORDER: PackageModuleId[] = [
  'blog',
  'galleries',
  'catalog',
  'quote',
  'events',
  'docs',
  'cart',
  'data',
];

const ADMIN_PANELS: Partial<Record<PackageModuleId, AdminPanel>> = {
  blog: {
    id: 'admin-blog',
    moduleId: 'blog',
    nav: 'Blog',
    image: '/assets/package-preview/admin/admin-blog.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion del blog del micrositio',
  },
  galleries: {
    id: 'admin-galerias',
    moduleId: 'galleries',
    nav: 'Galerias',
    image: '/assets/package-preview/admin/admin-galerias.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion de galerias del micrositio',
  },
  catalog: {
    id: 'admin-catalogo',
    moduleId: 'catalog',
    nav: 'Catalogo',
    image: '/assets/package-preview/admin/admin-catalogo.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion del catalogo del micrositio',
  },
  quote: {
    id: 'admin-solicitudes',
    moduleId: 'quote',
    nav: 'Solicitudes',
    image: '/assets/package-preview/admin/admin-solicitudes.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion de solicitudes del micrositio',
  },
  events: {
    id: 'admin-eventos',
    moduleId: 'events',
    nav: 'Eventos',
    image: '/assets/package-preview/admin/admin-eventos.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion de eventos del micrositio',
  },
  docs: {
    id: 'admin-docs',
    moduleId: 'docs',
    nav: 'Docs',
    image: '/assets/package-preview/admin/admin-docs.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion de documentos del micrositio',
  },
  cart: {
    id: 'admin-compras',
    moduleId: 'cart',
    nav: 'Compras',
    image: '/assets/package-preview/admin/admin-compras.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion de compras del micrositio',
  },
  data: {
    id: 'admin-resultados',
    moduleId: 'data',
    nav: 'AI Optimization',
    image: '/assets/package-preview/admin/admin-optimization.webp?v=20260805_cropped_v4',
    alt: 'Pantalla de administracion de optimization del micrositio',
  },
};

const SUMMARY_PANEL: AdminPanel = {
  id: 'admin-resumen',
  nav: 'Resumen',
  image: '/assets/package-preview/admin/admin-resumen.webp?v=20260805_cropped_v4',
  alt: 'Resumen del portal administrador del micrositio',
};

const catalogItems = [
  {
    id: 'distrito-norte',
    city: 'Merida',
    name: 'Distrito Norte',
    region: 'Yucatan',
    meta: 'Departamentos · Preventa',
    status: '18 unidades',
    metric: 'ROI estimado 8-12%',
    image: '/assets/package-builder/landing-consulting.webp',
    detailImage: '/assets/package-builder/catalog.webp',
    highlights: ['2 recamaras', 'Rooftop', 'Entrega 2027'],
  },
  {
    id: 'costa-serena',
    city: 'Playa del Carmen',
    name: 'Costa Serena',
    region: 'Quintana Roo',
    meta: 'Residencias · Entrega 2027',
    status: '9 residencias',
    metric: 'Zona turistica',
    image: '/assets/package-builder/galleries-paintings.webp',
    detailImage: '/assets/package-builder/landing-consulting.webp',
    highlights: ['Amenidades', 'Baja densidad', 'Vista verde'],
  },
  {
    id: 'casa-patio',
    city: 'San Miguel',
    name: 'Casa Patio',
    region: 'Guanajuato',
    meta: 'Villas · Baja densidad',
    status: '6 villas',
    metric: 'Patrimonio',
    image: '/assets/package-builder/catalog.webp',
    detailImage: '/assets/package-builder/galleries-paintings.webp',
    highlights: ['Arquitectura', 'Privacidad', 'Plusvalia'],
  },
];
const firstCatalogItem = catalogItems[0]!;

function getPublicSections(draft: PackageDraft) {
  if (draft.plan === 'free') return [] as PublicSection[];
  const selected = new Set(draft.modules);
  return PUBLIC_SECTION_ORDER.flatMap((moduleId) => {
    const section = PUBLIC_SECTIONS[moduleId];
    return selected.has(moduleId) && section ? [section] : [];
  });
}

function getAdminPanels(draft: PackageDraft) {
  if (draft.plan === 'free') return [] as AdminPanel[];
  const selected = new Set(draft.modules);
  return [
    SUMMARY_PANEL,
    ...ADMIN_PANEL_ORDER.flatMap((moduleId) => {
      const panel = ADMIN_PANELS[moduleId];
      return selected.has(moduleId) && panel ? [panel] : [];
    }),
  ];
}

function PublicPreview({ draft }: { draft: PackageDraft }) {
  const sections = useMemo(() => getPublicSections(draft), [draft]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [catalogView, setCatalogView] = useState<CatalogView>('list');
  const [activeCatalogId, setActiveCatalogId] = useState(firstCatalogItem.id);

  const scrollToSection = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openCatalogDetail = (itemId: string) => {
    setActiveCatalogId(itemId);
    setCatalogView('detail');
    window.requestAnimationFrame(() => scrollToSection('catalogo'));
  };

  return (
    <div className="lmw-live-site lmw-live-site--concept" ref={scrollRef}>
      <header className="lmw-live-site__nav">
        <button onClick={() => scrollToSection('inicio')} type="button">Inicio</button>
        {sections.map((section) => (
          <button key={section.id} onClick={() => scrollToSection(section.id)} type="button">
            {section.nav}
          </button>
        ))}
      </header>

      <section
        className="lmw-live-shot-section"
        ref={(node) => { sectionRefs.current.inicio = node; }}
      >
        <ConceptFrame
          alt="Inicio del micrositio de ejemplo"
          src="/assets/package-preview/concepts/public-inicio.webp?v=20260805_editorial"
          variant="home"
        />
      </section>

      {sections.map((section) => (
        <section
          className={`lmw-live-shot-section lmw-live-shot-section--${section.moduleId}`}
          key={section.id}
          ref={(node) => { sectionRefs.current[section.id] = node; }}
        >
          {section.moduleId === 'catalog' ? (
            <CatalogConceptSection
              activeItemId={activeCatalogId}
              catalogView={catalogView}
              onBack={() => setCatalogView('list')}
              onOpenDetail={openCatalogDetail}
            />
          ) : (
            <ConceptFrame
              alt={`Seccion ${section.nav} del micrositio de ejemplo`}
              src={PUBLIC_CONCEPT_BY_MODULE[section.moduleId] ?? section.image}
            />
          )}
        </section>
      ))}
    </div>
  );
}

function FreeExamplePreview() {
  return (
    <div className="lmw-free-example">
      <header className="lmw-free-example__notice">
        <div>
          <span>Demostración de entrega Free</span>
          <strong>Dr. Mateo Ríos</strong>
        </div>
        <p>
          Muestra fija basada en la plantilla de una página Free: portada, información esencial,
          servicios, galería y contacto. No utiliza los datos ni las imágenes de tu solicitud.
        </p>
      </header>
      <img
        alt="Demostración de una página informativa Free para un médico"
        className="lmw-free-example__poster"
        src="/assets/free-poster-tests/dr-mateo-rios-poster-test.png"
      />
    </div>
  );
}

function ConceptFrame({
  alt,
  src,
  variant,
}: {
  alt: string;
  src: string;
  variant?: 'home';
}) {
  return (
    <div className={`lmw-concept-frame${variant ? ` lmw-concept-frame--${variant}` : ''}`}>
      <img alt={alt} src={src} />
    </div>
  );
}

function CatalogConceptSection({
  catalogView,
  onBack,
  onOpenDetail,
}: {
  activeItemId: string;
  catalogView: CatalogView;
  onBack: () => void;
  onOpenDetail: (itemId: string) => void;
}) {
  if (catalogView === 'detail') {
    return (
      <div className="lmw-catalog-concept">
        <ConceptFrame
          alt="Detalle interno de un elemento del catalogo"
          src="/assets/package-preview/concepts/public-catalogo-detalle.webp?v=20260805_editorial"
        />
        <button className="lmw-catalog-concept__back" onClick={onBack} type="button">
          Volver al catalogo
        </button>
      </div>
    );
  }

  return (
    <div className="lmw-catalog-concept">
      <ConceptFrame
        alt="Catalogo navegable del micrositio de ejemplo"
        src="/assets/package-preview/concepts/public-catalogo.webp?v=20260805_editorial"
      />
      <button
        className="lmw-catalog-concept__open"
        onClick={() => onOpenDetail(firstCatalogItem.id)}
        type="button"
      >
        Abrir detalle
      </button>
    </div>
  );
}

function GenericPublicSection({ section }: { section: PublicSection }) {
  return (
    <>
      <div className="lmw-live-section__media">
        <img alt="" src={section.image} />
        <i aria-hidden="true" />
      </div>
      <div className="lmw-live-section__copy">
        <span>{section.eyebrow}</span>
        <h2>{section.title}</h2>
        <p>{section.copy}</p>
        {section.action ? <button type="button">{section.action}</button> : null}
      </div>
    </>
  );
}

function CatalogSection({
  activeItemId,
  catalogView,
  onBack,
  onOpenDetail,
}: {
  activeItemId: string;
  catalogView: CatalogView;
  onBack: () => void;
  onOpenDetail: (itemId: string) => void;
}) {
  const activeItem = catalogItems.find((item) => item.id === activeItemId) ?? firstCatalogItem;

  if (catalogView === 'detail') {
    return (
      <div className="lmw-live-detail">
        <button onClick={onBack} type="button">Volver al catalogo</button>
        <div className="lmw-live-detail__visual">
          <span
            aria-hidden="true"
            className={`lmw-live-detail__art lmw-live-detail__art--${activeItem.id}`}
          />
          <aside>
            <span>{activeItem.city}</span>
            <strong>{activeItem.status}</strong>
            <small>{activeItem.metric}</small>
          </aside>
        </div>
        <article>
          <span>Ficha de oportunidad</span>
          <h2>{activeItem.name} · {activeItem.city}</h2>
          <p>
            Pagina interna con descripcion, imagenes, atributos, ubicacion, documentos y llamada a
            solicitud. No cambia el sitio completo: entra como un nivel interno del catalogo.
          </p>
          <dl>
            <div><dt>Tipo</dt><dd>{activeItem.meta.split(' · ')[0]}</dd></div>
            <div><dt>Estado</dt><dd>{activeItem.meta.split(' · ')[1]}</dd></div>
            <div><dt>Ubicacion</dt><dd>{activeItem.region}</dd></div>
          </dl>
          <ul>
            {activeItem.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
          </ul>
          <button type="button">Solicitar informacion</button>
        </article>
      </div>
    );
  }

  return (
    <div className="lmw-live-catalog">
      <header className="lmw-live-catalog__intro">
        <div>
          <span>Inventario</span>
          <h2>Oportunidades disponibles.</h2>
          <p>Tarjetas comparables, filtros visibles y una ficha interna por cada elemento.</p>
        </div>
        <div className="lmw-live-catalog__filters" aria-label="Filtros de ejemplo">
          <button type="button">Ubicacion</button>
          <button type="button">Tipo</button>
          <button type="button">Entrega</button>
          <button type="button">Filtrar</button>
        </div>
      </header>

      <button
        className="lmw-live-catalog__featured"
        onClick={() => onOpenDetail(firstCatalogItem.id)}
        type="button"
      >
        <span
          aria-hidden="true"
          className="lmw-live-catalog__art lmw-live-catalog__art--featured"
        />
        <span>{firstCatalogItem.city}</span>
        <strong>{firstCatalogItem.name}</strong>
        <small>{firstCatalogItem.meta}</small>
        <em>Ver proyecto</em>
      </button>

      <div className="lmw-live-catalog__grid">
        {catalogItems.slice(1).map((item) => (
          <button key={item.name} onClick={() => onOpenDetail(item.id)} type="button">
            <span
              aria-hidden="true"
              className={`lmw-live-catalog__art lmw-live-catalog__art--${item.id}`}
            />
            <div>
              <span>{item.city}</span>
              <strong>{item.name}</strong>
              <small>{item.meta}</small>
            </div>
            <em>{item.status}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminPanelIcon({ id }: { id: string }) {
  switch (id) {
    case 'admin-resumen':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1"/>
          <rect x="14" y="3" width="7" height="5" rx="1"/>
          <rect x="14" y="12" width="7" height="9" rx="1"/>
          <rect x="3" y="16" width="7" height="5" rx="1"/>
        </svg>
      );
    case 'admin-blog':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      );
    case 'admin-galerias':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      );
    case 'admin-catalogo':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      );
    case 'admin-solicitudes':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
      );
    case 'admin-eventos':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      );
    case 'admin-docs':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      );
    case 'admin-compras':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/>
          <circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      );
    case 'admin-resultados':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      );
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      );
  }
}

function AdminPreview({ draft }: { draft: PackageDraft }) {
  const panels = useMemo(() => getAdminPanels(draft), [draft]);
  const [activeId, setActiveId] = useState(panels[0]?.id ?? '');
  const mainRef = useRef<HTMLElement | null>(null);
  const activePanel = panels.find((panel) => panel.id === activeId) ?? panels[0];

  useEffect(() => {
    setActiveId(panels[0]?.id ?? '');
  }, [panels]);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [activePanel?.id]);

  if (!activePanel) {
    return (
      <div className="lmw-admin-empty">
        <span>Free</span>
        <h2>Este plan no incluye administrador.</h2>
        <p>El flujo Free genera una pagina informativa simple y se atiende desde LMWares.</p>
      </div>
    );
  }

  return (
    <div className="lmw-admin-preview">
      <aside className="lmw-admin-preview__sidebar">
        <div className="lmw-admin-preview__brand">
          <span className="lmw-admin-preview__badge" aria-hidden="true" />
          <div>
            <strong>TU MARCA AQUÍ</strong>
            <small>Panel Administrador</small>
          </div>
        </div>
        <nav className="lmw-admin-preview__nav">
          {panels.map((panel) => {
            const isActive = panel.id === activePanel.id;
            return (
              <button
                className={`lmw-admin-nav-item ${isActive ? 'is-active' : ''}`}
                key={panel.id}
                onClick={() => setActiveId(panel.id)}
                type="button"
              >
                <AdminPanelIcon id={panel.id} />
                <span>{panel.nav}</span>
                {isActive && <i className="lmw-admin-nav-item__indicator" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="lmw-admin-preview__main" ref={mainRef}>
        <div className="lmw-admin-preview__viewport">
          <img
            alt={activePanel.alt}
            className="lmw-admin-preview__screen"
            src={activePanel.image}
          />
        </div>
      </main>
    </div>
  );
}

export function PackagePreviewModal({
  draft,
  open,
  onClose,
  onContinue,
}: PackagePreviewModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<PreviewMode>('public');
  const hasAdmin = draft.plan !== 'free';

  useEffect(() => {
    if (!open) return;

    setMode('public');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 50);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="lmw-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Ejemplo demostrativo del paquete"
        aria-modal="true"
        className="lmw-preview-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="lmw-preview-shellbar">
          <div className="lmw-preview-brand"><i />LMWARES</div>
          <div className="lmw-preview-mode" aria-label="Cambiar entre sitio publico y administrador">
            <button
              aria-pressed={mode === 'public'}
              className={mode === 'public' ? 'is-active' : ''}
              onClick={() => setMode('public')}
              type="button"
            >
              {draft.plan === 'free' ? 'Ejemplo' : 'Public'}
            </button>
            <button
              aria-disabled={!hasAdmin}
              aria-pressed={mode === 'admin'}
              className={mode === 'admin' ? 'is-active' : ''}
              disabled={!hasAdmin}
              onClick={() => setMode('admin')}
              type="button"
            >
              Admin
            </button>
          </div>
          <button className="lmw-preview-close" onClick={onClose} type="button" aria-label="Cerrar ejemplo">
            Cerrar
          </button>
        </header>

        <div className="lmw-preview-canvas">
          {mode === 'admin' ? (
            <AdminPreview draft={draft} />
          ) : draft.plan === 'free' ? (
            <FreeExamplePreview />
          ) : (
            <PublicPreview draft={draft} />
          )}
        </div>

        <footer className="lmw-preview-footer">
          <button onClick={onClose} type="button">Editar seleccion</button>
          <div className="lmw-preview-footer__meta">
            <div>
              <span>
                {mode === 'public'
                  ? draft.plan === 'free' ? 'Ejemplo público' : 'Micrositio vertical'
                  : 'Portal administrador'}
              </span>
              <strong>{draft.plan.toUpperCase()}</strong>
            </div>
            <p>
              {draft.plan === 'free'
                ? 'Demostración fija del formato Free. Tus datos e imágenes sólo aparecerán en la página real después de completar la generación.'
                : 'Vista demostrativa para identificar los módulos seleccionados. El diseño y la organización final pueden cambiar según tus necesidades y requerimientos.'}
            </p>
          </div>
          <button onClick={onContinue} type="button">Continuar con este paquete</button>
        </footer>
      </section>
    </div>
  );
}
