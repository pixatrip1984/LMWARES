import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaqGraphic,
  FaqQuestionArtwork,
  IntroArtwork,
  PlanPreview,
  VisualMedia,
} from './LmwVisuals';
import {
  FAQ_GROUPS,
  LMWARES_PRELOAD_ASSETS,
  LMWARES_ASSETS,
  OWNERSHIP_ASSETS,
  SCALE_LEVELS,
  SOLUTION_MODULES,
  TABS,
  THESIS_STEPS,
  type FaqGroup,
  type TabId,
} from './lmwaresContent';

const NAV_DURATION_MS = 1120;
const NAV_LOCK_MS = NAV_DURATION_MS + 80;
const FAQ_PANEL_DURATION_MS = 560;
const FAQ_HOVER_INTENT_MS = 110;
const SCENE_EASING = 'cubic-bezier(0.76, 0, 0.24, 1)';
const SCENE_CYCLES = [0, 1, 2, 3];
const FIRST_TAB = TABS[0]!;
const forwardKeys = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ']);
const backwardKeys = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

type Direction = -1 | 1;

type PageTransition = {
  fromIndex: number;
  toIndex: number;
  direction: Direction;
};

type FaqSelection = {
  groupIndex: number;
  questionIndex: number;
};

function getInitialTabIndex() {
  if (typeof window === 'undefined') return 0;
  const id = window.location.hash.replace('#', '');
  const index = TABS.findIndex((tab) => tab.id === id);
  return index >= 0 ? index : 0;
}

export function ContractPage() {
  const navigate = useNavigate();
  const initialIndex = useMemo(getInitialTabIndex, []);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scenePosition, setScenePosition] = useState(initialIndex + 3);
  const [sceneAnimated, setSceneAnimated] = useState(true);
  const [travelling, setTravelling] = useState(false);
  const [direction, setDirection] = useState<Direction>(1);
  const [pageTransition, setPageTransition] = useState<PageTransition | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const lockUntilRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const wheelBufferRef = useRef(0);
  const lastWheelRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeTab = TABS[activeIndex] ?? FIRST_TAB;
  const channelTabs = TABS.filter((tab) => tab.channel === activeTab.channel);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    pageRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const preloadTimer = window.setTimeout(() => {
      LMWARES_PRELOAD_ASSETS.forEach((src) => {
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
        void image.decode().catch(() => undefined);
      });
    }, 0);

    return () => window.clearTimeout(preloadTimer);
  }, []);

  const finishWrappedScene = useCallback((resetPosition: number) => {
    setSceneAnimated(false);
    setScenePosition(resetPosition);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setSceneAnimated(true));
    });
  }, []);

  const goToIndex = useCallback(
    (requestedIndex: number, requestedDirection?: Direction) => {
      const now = performance.now();
      if (now < lockUntilRef.current) return;

      const nextIndex = ((requestedIndex % TABS.length) + TABS.length) % TABS.length;
      if (nextIndex === activeIndex) return;

      const nextDirection = requestedDirection ?? (nextIndex > activeIndex ? 1 : -1);
      const currentTab = TABS[activeIndex] ?? FIRST_TAB;
      const nextTab = TABS[nextIndex] ?? FIRST_TAB;
      const channelChanges = currentTab.channel !== nextTab.channel;
      const wrapsForward =
        activeIndex === TABS.length - 1 && nextIndex === 0 && nextDirection === 1;
      const wrapsBackward =
        activeIndex === 0 && nextIndex === TABS.length - 1 && nextDirection === -1;
      const targetScenePosition = wrapsForward ? 9 : wrapsBackward ? 2 : nextIndex + 3;

      lockUntilRef.current = now + NAV_LOCK_MS;
      setDirection(nextDirection);
      setPageTransition({ fromIndex: activeIndex, toIndex: nextIndex, direction: nextDirection });
      setTravelling(channelChanges);
      setSceneAnimated(true);
      setScenePosition(targetScenePosition);
      setActiveIndex(nextIndex);
      window.history.replaceState(null, '', `#${nextTab.id}`);

      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = window.setTimeout(() => {
        if (wrapsForward) finishWrappedScene(3);
        if (wrapsBackward) finishWrappedScene(8);
        setPageTransition(null);
        setTravelling(false);
      }, NAV_DURATION_MS);
    },
    [activeIndex, finishWrappedScene],
  );

  useEffect(() => {
    const handleHashChange = () => {
      const nextIndex = getInitialTabIndex();
      if (nextIndex === activeIndex) return;
      goToIndex(nextIndex, nextIndex > activeIndex ? 1 : -1);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeIndex, goToIndex]);

  const step = useCallback(
    (nextDirection: Direction) => goToIndex(activeIndex + nextDirection, nextDirection),
    [activeIndex, goToIndex],
  );

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (window.innerWidth <= 700) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-allow-scroll="true"]')) return;

    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelRef.current > 300) wheelBufferRef.current = 0;
    lastWheelRef.current = now;
    wheelBufferRef.current += event.deltaY || event.deltaX;
    if (Math.abs(wheelBufferRef.current) < 72) return;
    step(wheelBufferRef.current > 0 ? 1 : -1);
    wheelBufferRef.current = 0;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (forwardKeys.has(event.key)) {
      event.preventDefault();
      step(1);
    } else if (backwardKeys.has(event.key)) {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goToIndex(0, -1);
    } else if (event.key === 'End') {
      event.preventDefault();
      goToIndex(TABS.length - 1, 1);
    }
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const deltaX = start.x - touch.clientX;
    const deltaY = start.y - touch.clientY;
    if (window.innerWidth <= 700 && Math.abs(deltaY) > Math.abs(deltaX)) return;
    const strongest = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    if (Math.abs(strongest) > 36) step(strongest > 0 ? 1 : -1);
  };

  const pageStyle = {
    '--lmw-scene-position': scenePosition,
    '--lmw-scene-easing': SCENE_EASING,
  } as CSSProperties;

  return (
    <section
      aria-label="LMWares, sistemas web ligeros"
      className={`lmw-page${pageTransition ? ' lmw-page--transitioning' : ''}`}
      data-channel={activeTab.channel}
      data-direction={direction > 0 ? 'forward' : 'backward'}
      data-tab={activeTab.id}
      onKeyDown={handleKeyDown}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      onWheel={handleWheel}
      ref={pageRef}
      style={pageStyle}
      tabIndex={0}
    >
      <PanoramicScene animated={sceneAnimated} />
      <div className="lmw-atmosphere" aria-hidden="true" />
      <div className="lmw-grid" aria-hidden="true" />
      <div className="lmw-beam" aria-hidden="true" />
      <div className="lmw-particles" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => (
          <i key={index} />
        ))}
      </div>

      <a
        className="lmw-brand"
        href="#tesis"
        onClick={(event) => {
          event.preventDefault();
          goToIndex(0, -1);
        }}
      >
        <span>LM</span>WARES
        <i />
      </a>

      <a
        className="lmw-cta"
        href="/acceso"
        onClick={(event) => {
          event.preventDefault();
          navigate('/acceso');
        }}
      >
        Evaluar proyecto <span>↗</span>
      </a>

      <main className="lmw-main" aria-live="polite">
        <div className="lmw-content-stack">
          {pageTransition ? (
            <>
              <div
                aria-hidden="true"
                className={`lmw-content lmw-content--leaving lmw-content--${pageTransition.direction > 0 ? 'forward' : 'backward'}`}
                key={TABS[pageTransition.fromIndex]?.id}
              >
                <TabContent tabId={(TABS[pageTransition.fromIndex] ?? FIRST_TAB).id} />
              </div>
              <div
                className={`lmw-content lmw-content--entering lmw-content--${pageTransition.direction > 0 ? 'forward' : 'backward'}`}
                key={TABS[pageTransition.toIndex]?.id}
              >
                <TabContent tabId={(TABS[pageTransition.toIndex] ?? FIRST_TAB).id} />
              </div>
            </>
          ) : (
            <div className="lmw-content lmw-content--current" key={activeTab.id}>
              <TabContent tabId={activeTab.id} />
            </div>
          )}
        </div>
      </main>

      <nav
        aria-label={`Secciones ${activeTab.channel === 0 ? '01 a 03' : '04 a 06'}`}
        className={`lmw-nav${travelling ? ' lmw-nav--travelling' : ''}`}
      >
        <span className="lmw-nav__channel">
          {activeTab.channel === 0 ? '01 / SISTEMA' : '02 / ESCALA'}
        </span>
        <div className="lmw-nav__rail" aria-hidden="true" />
        {channelTabs.map((tab) => {
          const index = TABS.findIndex((candidate) => candidate.id === tab.id);
          const isActive = tab.id === activeTab.id;
          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`lmw-nav__item${isActive ? ' is-active' : ''}`}
              key={tab.id}
              onClick={() => goToIndex(index, index > activeIndex ? 1 : -1)}
              type="button"
            >
              <span>{tab.number}</span>
              <strong>{tab.label}</strong>
            </button>
          );
        })}
      </nav>

      <div className="lmw-position" aria-hidden="true">
        <span>{activeTab.number}</span>
        <i />
        <span>06</span>
      </div>
      <p className="lmw-hint">Rueda · flechas · desliza</p>
    </section>
  );
}

function PanoramicScene({ animated }: { animated: boolean }) {
  return (
    <div className="lmw-scene" aria-hidden="true">
      <div className={`lmw-scene__track${animated ? '' : ' is-instant'}`}>
        {SCENE_CYCLES.map((cycle) => (
          <div className="lmw-scene__cycle" key={cycle} />
        ))}
      </div>
    </div>
  );
}

function TabContent({ tabId }: { tabId: TabId }) {
  if (tabId === 'tesis') return <TesisTab />;
  if (tabId === 'modelo') return <ModeloTab />;
  if (tabId === 'operacion') return <OperacionTab />;
  if (tabId === 'capacidad') return <CapacidadTab />;
  if (tabId === 'planes') return <PlanesTab />;
  return <ObjecionesTab />;
}

function TesisTab() {
  return (
    <SectionLayout
      kind="tesis"
      eyebrow="Sistemas web ligeros para negocios pequeños"
      title={
        <>
          Un sistema hecho
          <br />
          para tu operación.
        </>
      }
      lead="Construimos soluciones web ligeras, rápidas y claras para necesidades concretas. Sin una plataforma enorme ni una renta obligatoria por usarla."
      quote="Pagas por construirlo. Después, sólo por el trabajo o la capacidad adicional que realmente necesitas."
    >
      <div className="lmw-thesis-grid">
        {THESIS_STEPS.map((step, index) => (
          <article className={`lmw-feature-card lmw-feature-card--${index + 1}`} key={step.title}>
            <VisualMedia alt={`Representación visual de ${step.title}`} src={step.asset} />
            <div className="lmw-feature-label">
              <span>{step.number}</span>
              <strong>{step.title}</strong>
              <small>{step.text}</small>
            </div>
          </article>
        ))}
        <img
          alt="Sistema ligero LMWares, Cloudflare-first"
          className="lmw-core lmw-core--thesis lmw-core-image"
          src="/assets/lmwares/tesis/core.webp"
        />
      </div>
      <TrustStrip
        items={['Licencia indefinida', 'Mantenimiento opcional', 'Tus datos y dominio']}
      />
    </SectionLayout>
  );
}

function ModeloTab() {
  return (
    <SectionLayout
      kind="modelo"
      eyebrow="Modelo de entrega"
      title={
        <>
          Construimos el sistema.
          <br />
          Tú conservas tus activos.
        </>
      }
      lead="La licencia es el derecho de utilizar la implementación para el negocio contratado. Tu marca, contenido, datos y dominio permanecen bajo tu control."
      quote="El subdominio de LMWares es el entorno temporal de revisión; la operación formal vive en tu dominio."
    >
      <div className="lmw-ownership-grid">
        <VisualColumn title="Tus activos" tone="blue" items={OWNERSHIP_ASSETS} />
        <div className="lmw-license-core">
          <img alt="Licencia de uso indefinida para tu negocio" src="/assets/lmwares/modelo/licencia.webp" />
        </div>
        <VisualColumn title="Base LMWares" tone="red" items={LMWARES_ASSETS} />
      </div>
      <ProcessLine items={['Revisión temporal', 'Activación', 'Dominio propio']} numbered />
    </SectionLayout>
  );
}

function OperacionTab() {
  return (
    <SectionLayout
      kind="operacion"
      eyebrow="Soluciones en operación"
      title={
        <>
          Herramientas a medida
          <br />
          para operar mejor.
        </>
      }
      lead="Traducimos una necesidad real en una herramienta clara: captación, catálogo, cotización, administración o automatización ligera."
      quote="Primero resolvemos lo esencial; después ampliamos sólo lo que la operación demuestre que necesita."
    >
      <div className="lmw-solutions-grid">
        {SOLUTION_MODULES.map((module, index) => (
          <article
            className={`lmw-solution-card${'availability' in module && module.availability === 'coming-soon' ? ' is-coming-soon' : ''}`}
            key={module.title}
            style={{ '--solution-index': index } as CSSProperties}
          >
            <VisualMedia
              alt={`${module.title}: ${module.subtitle}`}
              src={module.asset}
            />
            <div className="lmw-solution-label">
              <strong>{module.title}</strong>
              <span>{module.subtitle}</span>
            </div>
          </article>
        ))}
        <img
          alt="Sistema LMWares a medida"
          className="lmw-core lmw-core--solutions lmw-core-image"
          src="/assets/lmwares/operacion/core.webp"
        />
      </div>
      <ProcessLine
        items={[
          'Necesidad concreta',
          'Herramienta web',
          'Operación publicada',
          'Mejora con evidencia',
        ]}
      />
    </SectionLayout>
  );
}

function CapacidadTab() {
  return (
    <SectionLayout
      kind="capacidad"
      eyebrow="Capacidad escalable"
      title={
        <>
          Empieza ligero.
          <br />
          Crece cuando haga falta.
        </>
      }
      lead="Tu proyecto comienza con una base adecuada para uso moderado. La infraestructura se amplía cuando el tráfico, el catálogo o las operaciones lo justifican."
      quote="Te proponemos el siguiente nivel antes de realizar cualquier cambio de capacidad."
    >
      <div className="lmw-scale-grid">
        {SCALE_LEVELS.map((level, index) => (
          <article
            className={`lmw-scale-card lmw-scale-card--${level.pattern}`}
            key={level.title}
            style={{ '--scale-index': index } as CSSProperties}
          >
            <img
              alt={`${level.title}. ${level.description}. ${level.signal}.`}
              className="lmw-scale-card__image"
              src={level.asset}
            />
            <div className="lmw-scale-card__label">
              <span>{level.number}</span>
              <strong>{level.title}</strong>
              <p>{level.description}</p>
              <small>{level.signal}</small>
            </div>
          </article>
        ))}
      </div>
      <TrustStrip items={['Más visitas', 'Más catálogo', 'Más archivos', 'Más automatización']} />
    </SectionLayout>
  );
}

function PlanesTab() {
  return (
    <SectionLayout
      className="lmw-section--plans"
      kind="planes"
      eyebrow="Planes de acompañamiento"
      title={
        <>
          Elige cuánto
          <br />
          acompañamiento necesitas.
        </>
      }
      lead="La implementación puede contratarse como pago único. El mantenimiento se añade sólo cuando el proyecto necesita operación continua."
      quote="Paga acompañamiento únicamente cuando aporta valor al momento real del negocio."
    >
      <div className="lmw-plans-grid">
        <PlanCard
          kind="basic"
          eyebrow="LMWares · desde $299/mes"
          title="Mantenimiento básico"
          items={['Cambios ligeros', 'Actualizaciones mensuales', 'Soporte básico']}
          note="Para sitios estables"
        />
        <PlanCard
          kind="advanced"
          eyebrow="LMWares · desde $599/mes"
          title="Mantenimiento avanzado"
          items={['Cambios semanales', 'Mayor flexibilidad', 'Catálogo activo']}
          note="Para sistemas vivos"
        />
        <PlanCard
          kind="astra"
          eyebrow="Marketing"
          title="Marketing general"
          items={['Campañas para cualquier negocio', 'Estrategia', 'Creatividades', 'Contenido']}
          note="Próximamente · AstraMuses inicia con LMWares"
        />
      </div>
      <ProcessLine items={['Implementación', 'Cuidado', 'Crecimiento comercial']} />
    </SectionLayout>
  );
}

function ObjecionesTab() {
  const [selection, setSelection] = useState<FaqSelection>({ groupIndex: 0, questionIndex: 0 });
  const [previousSelection, setPreviousSelection] = useState<FaqSelection | null>(null);
  const [transitionId, setTransitionId] = useState(0);
  const selectionRef = useRef(selection);
  const answerTimerRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const { groupIndex, questionIndex } = selection;
  const group = FAQ_GROUPS[groupIndex] ?? FAQ_GROUPS[0]!;

  const clearHoverIntent = useCallback(() => {
    if (hoverTimerRef.current === null) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const selectAnswer = useCallback((nextGroupIndex: number, nextQuestionIndex: number) => {
    const clampedGroupIndex = Math.max(0, Math.min(nextGroupIndex, FAQ_GROUPS.length - 1));
    const nextGroup = FAQ_GROUPS[clampedGroupIndex] ?? FAQ_GROUPS[0]!;
    const next: FaqSelection = {
      groupIndex: clampedGroupIndex,
      questionIndex: Math.max(0, Math.min(nextQuestionIndex, nextGroup.questions.length - 1)),
    };
    const current = selectionRef.current;
    if (current.groupIndex === next.groupIndex && current.questionIndex === next.questionIndex) return;

    if (answerTimerRef.current !== null) window.clearTimeout(answerTimerRef.current);
    setPreviousSelection(current);
    selectionRef.current = next;
    setSelection(next);
    setTransitionId((id) => id + 1);
    answerTimerRef.current = window.setTimeout(() => {
      setPreviousSelection(null);
      answerTimerRef.current = null;
    }, FAQ_PANEL_DURATION_MS);
  }, []);

  const selectGroup = (index: number) => {
    clearHoverIntent();
    selectAnswer(index, 0);
  };

  const scheduleQuestion = (index: number) => {
    clearHoverIntent();
    hoverTimerRef.current = window.setTimeout(() => {
      selectAnswer(groupIndex, index);
      hoverTimerRef.current = null;
    }, FAQ_HOVER_INTENT_MS);
  };

  useEffect(
    () => () => {
      clearHoverIntent();
      if (answerTimerRef.current !== null) window.clearTimeout(answerTimerRef.current);
    },
    [clearHoverIntent],
  );

  const previousGroup = previousSelection
    ? (FAQ_GROUPS[previousSelection.groupIndex] ?? FAQ_GROUPS[0]!)
    : null;

  return (
    <section className="lmw-faq" aria-labelledby="lmw-faq-title">
      <header className={`lmw-faq-intro lmw-faq-intro--${group.id}`}>
        <IntroArtwork kind={`faq-${group.id}`} />
        <div className="lmw-faq-intro__copy">
          <p>{group.eyebrow}</p>
          <h1 id="lmw-faq-title">{highlightLastSentence(group.headline)}</h1>
          <span>{group.lead}</span>
          <div className="lmw-faq-intro__proof">
            <i />
            {group.footer}
          </div>
        </div>
      </header>

      <div className="lmw-faq-workspace">
        <div className="lmw-faq-groups" role="tablist" aria-label="Grupos de preguntas">
          {FAQ_GROUPS.map((faqGroup, index) => (
            <button
              aria-selected={index === groupIndex}
              className={index === groupIndex ? 'is-active' : ''}
              key={faqGroup.id}
              onClick={() => selectGroup(index)}
              role="tab"
              type="button"
            >
              <i />
              {faqGroup.label}
            </button>
          ))}
        </div>

        <div className="lmw-faq-questions" key={group.id}>
          {group.questions.map((item, index) => (
            <button
              aria-pressed={index === questionIndex}
              className={index === questionIndex ? 'is-active' : ''}
              key={item.question}
              onClick={() => {
                clearHoverIntent();
                selectAnswer(groupIndex, index);
              }}
              onFocus={() => selectAnswer(groupIndex, index)}
              onMouseEnter={() => scheduleQuestion(index)}
              onMouseLeave={clearHoverIntent}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.question}</strong>
              <FaqQuestionArtwork groupId={group.id} questionIndex={index} />
            </button>
          ))}
        </div>

        <article className="lmw-faq-answer" aria-live="polite">
          {previousSelection && previousGroup ? (
            <FaqAnswerLayer
              group={previousGroup}
              key={`leaving-${transitionId}`}
              phase="leaving"
              questionIndex={previousSelection.questionIndex}
            />
          ) : null}
          <FaqAnswerLayer
            group={group}
            key={`current-${transitionId}`}
            phase={previousSelection ? 'entering' : 'current'}
            questionIndex={questionIndex}
          />
        </article>
      </div>
    </section>
  );
}

function FaqAnswerLayer({
  group,
  questionIndex,
  phase,
}: {
  group: FaqGroup;
  questionIndex: number;
  phase: 'current' | 'entering' | 'leaving';
}) {
  const question = group.questions[questionIndex] ?? group.questions[0]!;

  return (
    <div
      aria-hidden={phase === 'leaving' ? true : undefined}
      className={`lmw-faq-answer__layer is-${phase}`}
    >
      <div className="lmw-faq-answer__copy">
        <span>
          Respuesta {String(questionIndex + 1).padStart(2, '0')} / {group.label}
        </span>
        <h2>{question.question}</h2>
        <p>{question.answer}</p>
        <div className="lmw-faq-answer__badges">
          {question.badges.map((badge) => (
            <b key={badge}>
              <i />
              {badge}
            </b>
          ))}
        </div>
        <small>
          <i />
          {question.note}
        </small>
      </div>
      <FaqGraphic group={group} questionIndex={questionIndex} />
    </div>
  );
}

function highlightLastSentence(text: string) {
  const parts = text.match(/^(.*?[.!?])\s+(.*)$/);
  if (!parts) return text;
  return (
    <>
      {parts[1]}
      <br />
      <em>{parts[2]}</em>
    </>
  );
}

function SectionLayout({
  className,
  kind,
  eyebrow,
  title,
  lead,
  quote,
  children,
}: {
  className?: string;
  kind: string;
  eyebrow: string;
  title: ReactNode;
  lead: string;
  quote: string;
  children: ReactNode;
}) {
  return (
    <section className={`lmw-section lmw-section--${kind}${className ? ` ${className}` : ''}`}>
      <header className="lmw-intro">
        <IntroArtwork kind={kind} />
        <div className="lmw-intro__copy">
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <span>{lead}</span>
          <blockquote>{quote}</blockquote>
        </div>
      </header>
      <div className="lmw-stage">{children}</div>
    </section>
  );
}

function VisualColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'blue' | 'red';
  items: readonly { title: string; visual: string; asset: string }[];
}) {
  return (
    <div className={`lmw-visual-column lmw-visual-column--${tone}`}>
      <h2>{title}</h2>
      {items.map((item, index) => (
        <article key={item.title} style={{ '--asset-index': index } as CSSProperties}>
          <VisualMedia alt={item.title} src={item.asset} />
          <strong>{item.title}</strong>
        </article>
      ))}
    </div>
  );
}

function TrustStrip({ items }: { items: readonly string[] }) {
  return (
    <div className="lmw-trust-strip">
      {items.map((item, index) => (
        <span key={item} style={{ '--strip-index': index } as CSSProperties}>
          <i />
          {item}
        </span>
      ))}
    </div>
  );
}

function ProcessLine({
  items,
  numbered = false,
}: {
  items: readonly string[];
  numbered?: boolean;
}) {
  return (
    <div className={`lmw-process-line${numbered ? ' is-numbered' : ''}`}>
      {items.map((item, index) => (
        <span key={item} style={{ '--strip-index': index } as CSSProperties}>
          {numbered ? <b>{index + 1}</b> : null}
          {item}
          {index < items.length - 1 ? <i>→</i> : null}
        </span>
      ))}
    </div>
  );
}

function PlanCard({
  kind,
  eyebrow,
  title,
  items,
  note,
}: {
  kind: 'basic' | 'advanced' | 'astra';
  eyebrow: string;
  title: string;
  items: readonly string[];
  note: string;
}) {
  return (
    <article className={`lmw-plan-card lmw-plan-card--${kind}`}>
      <PlanPreview kind={kind} />
      <div className="lmw-plan-card__copy">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <strong>{note}</strong>
      </div>
    </article>
  );
}
