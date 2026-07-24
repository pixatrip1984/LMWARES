import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  cancelAgentRun,
  captureProjectScreen,
  generateDesignTarget,
  getAgentRunnerStatus,
  getDesignJob,
  getProjectCaptures,
  getProjectTargets,
  getProjectVisualMap,
  launchAgentBatch,
  saveProjectVisualMap,
  uploadDesignTarget,
  type AgentBatch,
  type DesignJob,
  type DiscoveredSection,
  type ProjectCapture,
  type ProjectTarget,
} from '../lib/agent-runner';

type ScreenKind =
  | 'catalog'
  | 'category'
  | 'detail'
  | 'quote'
  | 'contact'
  | 'admin-list'
  | 'admin-detail';

type FrameTrigger = 'initial' | 'automatic' | 'interaction' | 'scroll';
type PreviewSource = 'current' | 'target';
type VisualWorkspace = 'public' | 'admin';

interface VisualFrame {
  id: string;
  order: number;
  title: string;
  objective: string;
  instruction?: string;
  criteria: string[];
  approved: boolean;
  targetVersion: number;
  trigger: FrameTrigger;
  transition: string;
  durationMs: number;
  currentImageUrl?: string;
  currentImagePath?: string;
  currentWidth?: number;
  currentHeight?: number;
  currentCaptureState?: 'real' | 'missing';
  targetImageUrl?: string;
  targetImagePath?: string;
  targetWidth?: number;
  targetHeight?: number;
  targetSource?: 'imagegen' | 'uploaded';
}

interface VisualScreen {
  id: string;
  order: number;
  title: string;
  route: string;
  kind: ScreenKind;
  x: number;
  y: number;
  width: number;
  height: number;
  objective: string;
  designInstruction?: string;
  criteria: string[];
  variation: number;
  approved: boolean;
  targetVersion: number;
  sourceFiles?: string[];
  dependencies?: string[];
  currentImageUrl?: string;
  currentImagePath?: string;
  currentWidth?: number;
  currentHeight?: number;
  currentCaptureState?: 'real' | 'missing';
  targetImageUrl?: string;
  targetImagePath?: string;
  targetWidth?: number;
  targetHeight?: number;
  targetSource?: 'imagegen' | 'uploaded';
  app?: 'public-web' | 'admin-web';
  frames?: VisualFrame[];
}

interface VisualMapDraft {
  screens: VisualScreen[];
  selectedScreenId: string;
}

interface ImageViewerState {
  url: string;
  title: string;
  label: string;
}

const PROJECTS = ['ShynoLaser', 'Aurex MG', 'AstraMuses'];
const PRIMARY_FRAME_ID = 'primary';
const CANVAS_WIDTH = 1160;
const CANVAS_HEIGHT = 990;

const PUBLIC_CONNECTIONS = [
  ['catalog', 'atelier'],
  ['catalog', 'grabables'],
  ['atelier', 'detail'],
  ['grabables', 'detail'],
  ['detail', 'quote'],
  ['quote', 'contact'],
] as const;

const ADMIN_CONNECTIONS = [
  ['admin-catalog', 'admin-product'],
] as const;

export function PrepareWorkPage() {
  const [searchParams] = useSearchParams();
  const projectName = searchParams.get('name')?.trim() || 'ShynoLaser';
  const projectId = projectIdFor(projectName);
  const storageKey = `lmwares:oracle:visual-map:${projectName.toLowerCase()}`;
  const [screens, setScreens] = useState<VisualScreen[]>(() => buildScreens(projectName));
  const [selectedScreenId, setSelectedScreenId] = useState('quote');
  const [selectedFrameId, setSelectedFrameId] = useState(PRIMARY_FRAME_ID);
  const [zoom, setZoom] = useState(22);
  const [previewSource, setPreviewSource] = useState<PreviewSource>('current');
  const [visualWorkspace, setVisualWorkspace] = useState<VisualWorkspace>('public');
  const [editingCriterion, setEditingCriterion] = useState<number | null>(null);
  const [criterionDraft, setCriterionDraft] = useState('');
  const [addingCriterion, setAddingCriterion] = useState(false);
  const [newCriterion, setNewCriterion] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [agentBatch, setAgentBatch] = useState<AgentBatch | null>(null);
  const [designJobs, setDesignJobs] = useState<Record<string, DesignJob>>({});
  const [agentLaunching, setAgentLaunching] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [appliedDiscoveryBatchId, setAppliedDiscoveryBatchId] = useState<string | null>(null);
  const [mapHydrated, setMapHydrated] = useState(false);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const instructionInputRef = useRef<HTMLTextAreaElement>(null);
  const workspaceSelectionRef = useRef<Record<VisualWorkspace, string>>({
    public: 'quote',
    admin: 'admin-catalog',
  });

  const workspaceScreens = useMemo(
    () => screens.filter((screen) => workspaceForScreen(screen) === visualWorkspace),
    [screens, visualWorkspace],
  );
  const selectedScreen =
    workspaceScreens.find((screen) => screen.id === selectedScreenId) ?? workspaceScreens[0] ?? screens[0]!;
  const selectedFrame = frameFor(selectedScreen, selectedFrameId);
  const selectedDesignJob = designJobs[designJobKey(selectedScreen.id, selectedFrame.id)];
  const approvedCount = workspaceScreens.filter(isScreenReady).length;
  const canvasScale = zoom / 32;
  const agentActive = agentBatch?.status === 'preparing' || agentBatch?.status === 'running';
  const canvasScreens = useMemo(
    () =>
      reflowScreens(
        workspaceScreens.map((screen) => {
          const frame = frameFor(
            screen,
            screen.id === selectedScreenId ? selectedFrameId : PRIMARY_FRAME_ID,
          );
          return {
            ...screen,
            height: previewHeightForScreen(screenForFrame(screen, frame), previewSource),
          };
        }),
      ),
    [previewSource, selectedFrameId, selectedScreenId, workspaceScreens],
  );
  const canvasWidth = Math.max(
    CANVAS_WIDTH,
    ...canvasScreens.map((screen) => screen.x + screen.width + 60),
  );
  const canvasHeight = Math.max(
    CANVAS_HEIGHT,
    ...canvasScreens.map((screen) => screen.y + screen.height + 80),
  );
  const screenConnections = useMemo(() => {
    const workspaceIds = new Set(workspaceScreens.map((screen) => screen.id));
    const discovered = workspaceScreens.flatMap((screen) =>
      (screen.dependencies ?? [])
        .filter((dependency) => workspaceIds.has(dependency))
        .map((dependency) => [dependency, screen.id] as const),
    );
    const fallback = visualWorkspace === 'admin' ? ADMIN_CONNECTIONS : PUBLIC_CONNECTIONS;
    return discovered.length > 0 ? discovered : fallback;
  }, [visualWorkspace, workspaceScreens]);

  useEffect(() => {
    let cancelled = false;
    setMapHydrated(false);
    setAppliedDiscoveryBatchId(null);
    setSelectedFrameId(PRIMARY_FRAME_ID);
    setVisualWorkspace('public');

    void getProjectVisualMap<VisualScreen>(projectId)
      .then(async (remoteMap) => {
        if (cancelled) return;
        let draft: VisualMapDraft | null = remoteMap
          ? { selectedScreenId: remoteMap.selectedScreenId, screens: remoteMap.screens }
          : null;
        let migratedLocalDraft = false;
        if (!draft) {
          const raw = window.localStorage.getItem(storageKey);
          if (raw) {
            try {
              const localDraft = JSON.parse(raw) as VisualMapDraft;
              if (Array.isArray(localDraft.screens) && localDraft.screens.length > 0) {
                draft = localDraft;
                migratedLocalDraft = true;
              }
            } catch {
              window.localStorage.removeItem(storageKey);
            }
          }
        }

        const nextScreens = draft?.screens.length
          ? draft.screens.map(restoreDraftScreen)
          : buildScreens(projectName);
        const nextSelectedId = nextScreens.some((screen) => screen.id === draft?.selectedScreenId)
          ? draft!.selectedScreenId
          : nextScreens[0]!.id;
        const nextWorkspace = workspaceForScreen(
          nextScreens.find((screen) => screen.id === nextSelectedId) ?? nextScreens[0]!,
        );
        workspaceSelectionRef.current[nextWorkspace] = nextSelectedId;
        setScreens(nextScreens);
        setSelectedScreenId(nextSelectedId);
        setVisualWorkspace(nextWorkspace);
        setMapHydrated(true);

        if (migratedLocalDraft) {
          await saveProjectVisualMap(projectId, {
            selectedScreenId: nextSelectedId,
            screens: nextScreens.map(stripTransientImages),
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        let nextScreens = buildScreens(projectName);
        let nextSelectedId = nextScreens[0]!.id;
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          try {
            const localDraft = JSON.parse(raw) as VisualMapDraft;
            if (Array.isArray(localDraft.screens) && localDraft.screens.length > 0) {
              nextScreens = localDraft.screens.map(restoreDraftScreen);
              nextSelectedId = nextScreens.some((screen) => screen.id === localDraft.selectedScreenId)
                ? localDraft.selectedScreenId
                : nextScreens[0]!.id;
            }
          } catch {
            window.localStorage.removeItem(storageKey);
          }
        }
        setScreens(nextScreens);
        setSelectedScreenId(nextSelectedId);
        const nextWorkspace = workspaceForScreen(
          nextScreens.find((screen) => screen.id === nextSelectedId) ?? nextScreens[0]!,
        );
        workspaceSelectionRef.current[nextWorkspace] = nextSelectedId;
        setVisualWorkspace(nextWorkspace);
        setMapHydrated(true);
        setFeedback('El mapa compartido no respondió; se abrió la copia guardada en este navegador.');
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, projectName, storageKey]);

  useEffect(() => {
    if (!mapHydrated) return;
    let cancelled = false;
    getProjectCaptures(projectId)
      .then((manifest) => {
        if (cancelled || manifest.captures.length === 0) return;
        setScreens((current) => applyProjectCaptures(current, manifest.captures));
        setFeedback(`${manifest.captures.length} capturas reales cargadas desde ${manifest.baseUrl}.`);
      })
      .catch(() => {
        // Los demás proyectos pueden no tener todavía una sesión de captura real.
      });
    return () => {
      cancelled = true;
    };
  }, [appliedDiscoveryBatchId, mapHydrated, projectId]);

  useEffect(() => {
    if (!mapHydrated) return;
    let cancelled = false;
    getProjectTargets(projectId)
      .then((manifest) => {
        if (!cancelled) setScreens((current) => applyProjectTargets(current, manifest.targets));
      })
      .catch(() => {
        // El proyecto puede no tener todavía objetivos generados.
      });
    return () => {
      cancelled = true;
    };
  }, [appliedDiscoveryBatchId, mapHydrated, projectId]);

  useEffect(() => {
    let cancelled = false;
    getAgentRunnerStatus(projectId)
      .then((status) => {
        if (!cancelled) setAgentBatch(status.batch);
      })
      .catch(() => {
        // El mapa sigue siendo util aunque el runner local no este disponible.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!agentBatch || !agentActive) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      getAgentRunnerStatus(projectId, agentBatch.batchId)
        .then((status) => {
          if (!cancelled) setAgentBatch(status.batch);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setFeedback(error instanceof Error ? error.message : 'No fue posible actualizar el lote.');
          }
        });
    }, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentActive, agentBatch, projectId]);

  useEffect(() => {
    const activeJobs = Object.values(designJobs).filter((job) => isDesignActive(job.status));
    if (activeJobs.length === 0) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void Promise.all(activeJobs.map((job) => getDesignJob(projectId, job.jobId))).then(
        (jobs) => {
          if (cancelled) return;
          setDesignJobs((current) => {
            const next = { ...current };
            for (const job of jobs) {
              next[designJobKey(job.screenId, job.frameId ?? PRIMARY_FRAME_ID)] = job;
            }
            return next;
          });
          for (const job of jobs) {
            if (job.status === 'succeeded' && job.target) {
              setScreens((current) => applyProjectTargets(current, [job.target!]));
              setFeedback(`${job.title}: objetivo visual v${job.target.version} listo.`);
            } else if (!isDesignActive(job.status)) {
              setFeedback(`${job.title}: ${job.summary || 'la generación no pudo completarse.'}`);
            }
          }
        },
        (error: unknown) => {
          if (!cancelled) setFeedback(error instanceof Error ? error.message : 'No fue posible actualizar la generación.');
        },
      );
    }, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [designJobs, projectId]);

  useEffect(() => {
    if (
      !agentBatch ||
      agentBatch.mode !== 'discover' ||
      agentBatch.status !== 'succeeded' ||
      agentBatch.batchId === appliedDiscoveryBatchId
    ) {
      return;
    }
    const discovery = agentBatch.runs[0]?.result;
    if (!discovery?.sections?.length) return;
    const nextScreens = screensFromDiscovery(discovery.sections, screens);
    const currentScreen = nextScreens.find(
      (screen) => screen.id === selectedScreenId && workspaceForScreen(screen) === visualWorkspace,
    );
    const firstWorkspaceScreen = nextScreens.find(
      (screen) => workspaceForScreen(screen) === visualWorkspace,
    );
    const nextSelectedId = currentScreen?.id ?? firstWorkspaceScreen?.id ?? nextScreens[0]!.id;
    workspaceSelectionRef.current[workspaceForScreen(nextScreens.find((screen) => screen.id === nextSelectedId)!)] = nextSelectedId;
    setScreens(nextScreens);
    setSelectedScreenId(nextSelectedId);
    setAppliedDiscoveryBatchId(agentBatch.batchId);
    setFeedback(`${discovery.sections.length} pantallas inventariadas desde el código.`);
    void persistVisualMap(nextScreens, nextSelectedId);
  }, [agentBatch, appliedDiscoveryBatchId, screens, selectedScreenId, visualWorkspace]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const branchName = useMemo(
    () =>
      agentBatch?.runs.find((run) => run.taskId === selectedScreen.id)?.branchName ??
      `screen/${selectedScreen.order}-${projectSlug(selectedScreen.title)}`,
    [agentBatch, selectedScreen.id, selectedScreen.order, selectedScreen.title],
  );

  function patchScreen(id: string, update: (screen: VisualScreen) => VisualScreen) {
    setScreens((current) =>
      current.map((screen) => (screen.id === id ? update(screen) : screen)),
    );
  }

  function patchSelected(update: (screen: VisualScreen) => VisualScreen) {
    patchScreen(selectedScreen.id, update);
  }

  function patchSelectedFrame(update: (frame: VisualFrame) => VisualFrame) {
    patchSelected((screen) => updateFrame(screen, selectedFrameId, update));
  }

  function selectScreen(id: string) {
    workspaceSelectionRef.current[visualWorkspace] = id;
    setSelectedScreenId(id);
    setSelectedFrameId(PRIMARY_FRAME_ID);
    setEditingCriterion(null);
    setAddingCriterion(false);
    setFeedback(null);
  }

  function selectVisualWorkspace(nextWorkspace: VisualWorkspace) {
    if (nextWorkspace === visualWorkspace) return;
    workspaceSelectionRef.current[visualWorkspace] = selectedScreenId;
    const nextScreens = screens.filter((screen) => workspaceForScreen(screen) === nextWorkspace);
    const rememberedId = workspaceSelectionRef.current[nextWorkspace];
    const nextSelectedId = nextScreens.some((screen) => screen.id === rememberedId)
      ? rememberedId
      : nextScreens[0]?.id;
    if (!nextSelectedId) return;
    workspaceSelectionRef.current[nextWorkspace] = nextSelectedId;
    setVisualWorkspace(nextWorkspace);
    setSelectedScreenId(nextSelectedId);
    setSelectedFrameId(PRIMARY_FRAME_ID);
    setEditingCriterion(null);
    setAddingCriterion(false);
    setFeedback(null);
  }

  async function generateVariation() {
    const jobKey = designJobKey(selectedScreen.id, selectedFrame.id);
    const existing = designJobs[jobKey];
    if (existing && isDesignActive(existing.status)) return;
    const instruction = selectedFrame.instruction?.trim() ?? '';
    if (!instruction) {
      setFeedback('Escribe qué quieres cambiar antes de generar la imagen.');
      instructionInputRef.current?.focus();
      return;
    }
    setFeedback(`Generando ${selectedFrame.title} para ${selectedScreen.title}.`);
    try {
      await persistVisualMap(screens, selectedScreen.id);
      const job = await generateDesignTarget(projectId, {
        screenId: selectedScreen.id,
        frameId: selectedFrame.id,
        frameTitle: selectedFrame.title,
        title: selectedScreen.title,
        route: selectedScreen.route,
        objective: selectedFrame.objective,
        instruction,
        criteria: selectedFrame.criteria,
        trigger: selectedFrame.trigger,
        transition: selectedFrame.transition,
        durationMs: selectedFrame.durationMs,
      });
      setDesignJobs((current) => ({ ...current, [jobKey]: job }));
      patchSelectedFrame((frame) => ({ ...frame, approved: false }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible iniciar imagegen.');
    }
  }

  async function replaceImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    try {
      const target = await uploadDesignTarget(projectId, selectedScreen.id, file, selectedFrame.id);
      setScreens((current) => applyProjectTargets(current, [target]));
      patchSelectedFrame((frame) => ({ ...frame, approved: false }));
      setFeedback(`${file.name} quedó guardado como objetivo v${target.version}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible guardar la imagen.');
    }
  }

  async function recaptureSelectedFrame() {
    if (captureBusy) return;
    setCaptureBusy(true);
    setFeedback(`Capturando ${selectedFrame.title} desde el sitio real.`);
    try {
      const strategy =
        selectedFrame.id === PRIMARY_FRAME_ID && selectedScreen.kind !== 'quote'
          ? 'sections'
          : 'viewport';
      const capture = await captureProjectScreen(projectId, {
        screenId: selectedScreen.id,
        frameId: selectedFrame.id,
        route: selectedScreen.route,
        strategy,
      });
      const manifest = await getProjectCaptures(projectId);
      setScreens((current) => applyProjectCaptures(current, manifest.captures));
      setFeedback(
        `${selectedScreen.title} recapturada en ${capture.width}×${capture.height}.`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible recapturar la pantalla.');
    } finally {
      setCaptureBusy(false);
    }
  }

  function saveCriterion(index: number) {
    const value = criterionDraft.trim();
    if (!value) return;
    patchSelectedFrame((frame) => ({
      ...frame,
      criteria: frame.criteria.map((criterion, criterionIndex) =>
        criterionIndex === index ? value : criterion,
      ),
    }));
    setEditingCriterion(null);
    setCriterionDraft('');
  }

  function addCriterion() {
    const value = newCriterion.trim();
    if (!value) return;
    patchSelectedFrame((frame) => ({ ...frame, criteria: [...frame.criteria, value] }));
    setNewCriterion('');
    setAddingCriterion(false);
  }

  function toggleApproved() {
    if (!selectedFrame.targetImagePath) {
      setFeedback('Genera o reemplaza este fotograma antes de aprobarlo.');
      return;
    }
    patchSelectedFrame((frame) => ({ ...frame, approved: !frame.approved }));
  }

  async function persistVisualMap(
    mapScreens: VisualScreen[],
    mapSelectedScreenId: string,
  ) {
    const draft: VisualMapDraft = {
      selectedScreenId: mapSelectedScreenId,
      screens: mapScreens.map(stripTransientImages),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    await saveProjectVisualMap(projectId, draft);
  }

  async function saveMap() {
    try {
      await persistVisualMap(screens, selectedScreenId);
      setFeedback('Mapa visual guardado para abrirlo desde cualquier navegador.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible guardar el mapa visual.');
    }
  }

  function openSelectedImage(source: 'current' | 'target' | 'display' = 'display') {
    const screen = screenForFrame(selectedScreen, selectedFrame);
    const url =
      source === 'current'
        ? screen.currentImageUrl
        : source === 'target'
          ? screen.targetImageUrl
          : screen.targetImageUrl ?? screen.currentImageUrl;
    if (!url) {
      setFeedback('Esta tarea todavía no tiene una imagen que abrir.');
      return;
    }
    setImageViewer({
      url,
      title: selectedScreen.title,
      label: source === 'current' ? 'Captura actual' : source === 'target' ? 'Diseño objetivo' : selectedFrame.title,
    });
  }

  async function captureProject() {
    if (agentActive || agentLaunching) return;
    setAgentLaunching(true);
    setFeedback(null);
    try {
      const batch = await launchAgentBatch(projectId, 'discover', [
        {
          id: 'project-discovery',
          title: 'Descubrimiento visual del proyecto',
          route: '*',
          objective: 'Inventariar las pantallas visuales activas del proyecto.',
          criteria: [
            'Incluye rutas publicas activas',
            'Incluye superficies administrativas activas',
            'Excluye redirecciones y modulos no visuales',
            'Relaciona cada pantalla con sus archivos fuente',
          ],
          sourceFiles: [],
          imagePaths: [],
        },
      ]);
      setAgentBatch(batch);
      setFeedback('Agente de descubrimiento iniciado sobre un worktree aislado.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible iniciar el agente.');
    } finally {
      setAgentLaunching(false);
    }
  }

  function addScreen() {
    const nextOrder = Math.max(0, ...screens.map((candidate) => candidate.order)) + 1;
    const isAdmin = visualWorkspace === 'admin';
    const screen: VisualScreen = {
      id: `screen-${Date.now()}`,
      order: nextOrder,
      title: isAdmin ? 'Nueva pantalla administrativa' : 'Nueva pantalla',
      route: isAdmin ? '/admin/nueva-pantalla' : '/nueva-pantalla',
      kind: isAdmin ? 'admin-list' : 'category',
      x: 850,
      y: 710,
      width: 220,
      height: 250,
      objective: isAdmin
        ? 'Definir la función operativa de esta pantalla administrativa.'
        : 'Definir la intención visual de esta pantalla.',
      designInstruction: '',
      criteria: isAdmin
        ? ['Prioriza la tarea operativa', 'Funciona en móvil']
        : ['Mantiene la identidad del proyecto', 'Funciona en móvil'],
      variation: 0,
      approved: false,
      targetVersion: 0,
      app: isAdmin ? 'admin-web' : 'public-web',
    };
    setScreens((current) => [...current, screen]);
    selectScreen(screen.id);
    setFeedback('Nueva pantalla añadida al mapa.');
  }

  function addFrame() {
    const order = framesFor(selectedScreen).length + 1;
    const frame: VisualFrame = {
      id: `frame-${Date.now()}`,
      order,
      title: `Estado ${order}`,
      objective: 'Definir el siguiente estado visual de esta tarea.',
      instruction: '',
      criteria: [
        'Mantiene continuidad con el fotograma anterior',
        'La transición conserva legibilidad y contexto',
      ],
      approved: false,
      targetVersion: 0,
      trigger: 'automatic',
      transition: 'Fundido y desplazamiento suave',
      durationMs: 600,
    };
    patchSelected((screen) => ({ ...screen, frames: [...(screen.frames ?? []), frame] }));
    setSelectedFrameId(frame.id);
    setFeedback(`${frame.title} añadido a la secuencia de ${selectedScreen.title}.`);
  }

  async function prepareScreens() {
    if (agentActive || agentLaunching) return;
    await saveMap();
    const ready = workspaceScreens.filter(isScreenReady);
    setAgentLaunching(true);
    try {
      const batch = await launchAgentBatch(
        projectId,
        'implement',
        ready.map((screen) => {
          const frames = framesFor(screen);
          return {
            id: screen.id,
            title: screen.title,
            route: screen.route,
            objective: frames[0]!.objective,
            criteria: frames[0]!.criteria,
            sourceFiles: screen.sourceFiles ?? [],
            imagePaths: frames.map((frame) => frame.targetImagePath!),
            visualFrames: frames.map((frame) => ({
              id: frame.id,
              title: frame.title,
              objective: frame.objective,
              criteria: frame.criteria,
              trigger: frame.trigger,
              transition: frame.transition,
              durationMs: frame.durationMs,
              imagePath: frame.targetImagePath!,
            })),
          };
        }),
      );
      setAgentBatch(batch);
      setFeedback(`${ready.length} agentes iniciados en paralelo desde ${batch.baseRef}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible iniciar el lote.');
    } finally {
      setAgentLaunching(false);
    }
  }

  async function cancelSelectedRun() {
    const run = agentBatch?.runs.find(
      (candidate) => candidate.taskId === selectedScreen.id && candidate.status === 'running',
    );
    if (!run) return;
    try {
      await cancelAgentRun(projectId, run.runId);
      setFeedback(`Cancelando el agente de ${selectedScreen.title}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible cancelar el agente.');
    }
  }

  return (
    <div className="oracle-workspace min-h-screen bg-[#0e1122] text-[#f7f2ee] xl:grid xl:h-screen xl:grid-cols-[64px_164px_minmax(0,1fr)_274px] xl:overflow-hidden">
      <GlobalNavigation />
      <ProjectRail activeProject={projectName} />

      <main className="flex min-h-screen min-w-0 flex-col bg-[#101326] xl:h-screen xl:min-h-0">
        <header className="flex min-h-[50px] flex-wrap items-center justify-between gap-3 border-b border-[#343a59]/75 px-4 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Link to="/projects" className="font-semibold text-[#9ea4bc] hover:text-white">
                {projectName}
              </Link>
              <Icon name="chevron-right" className="h-3 w-3 text-[#555d7c]" />
              <h1 className="font-black text-white">Mapa visual</h1>
            </div>
            <div
              role="tablist"
              aria-label="Área del mapa visual"
              className="flex items-center rounded-md border border-[#3b4061] bg-[#191d35] p-0.5"
            >
              {(['public', 'admin'] as const).map((workspace) => {
                const count = screens.filter((screen) => workspaceForScreen(screen) === workspace).length;
                const active = visualWorkspace === workspace;
                return (
                  <button
                    key={workspace}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectVisualWorkspace(workspace)}
                    className={`flex h-7 items-center gap-2 rounded px-2.5 text-[9px] font-black transition ${
                      active
                        ? 'bg-[#303653] text-white shadow-sm'
                        : 'text-[#969db7] hover:text-white'
                    }`}
                  >
                    <span>{workspace === 'public' ? 'Sitio público' : 'Panel administrador'}</span>
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[7px] ${active ? 'bg-[#ff5a38] text-[#1b1010]' : 'bg-[#252a46] text-[#858da9]'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ToolbarButton
              icon="camera"
              onClick={captureProject}
              disabled={agentActive || agentLaunching}
            >
              {agentBatch?.mode === 'discover' && agentActive ? 'Descubriendo...' : 'Capturar proyecto'}
            </ToolbarButton>
            <ToolbarButton icon="plus" onClick={addScreen}>
              Nueva pantalla
            </ToolbarButton>
            <div className="flex items-center rounded-md border border-[#3b4061] bg-[#191d35] p-0.5">
              {(['current', 'target'] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setPreviewSource(source)}
                  className={`h-6 rounded px-2.5 text-[8px] font-black transition ${
                    previewSource === source
                      ? 'bg-[#ff5a38] text-[#1b1010]'
                      : 'text-[#aeb3c8] hover:text-white'
                  }`}
                >
                  {source === 'current' ? 'Actual' : 'Objetivo'}
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-md border border-[#3b4061] bg-[#191d35]">
              <button
                type="button"
                aria-label="Reducir zoom"
                onClick={() => setZoom((current) => Math.max(16, current - 2))}
                className="grid h-7 w-7 place-items-center text-[#aeb3c8] hover:text-white"
              >
                −
              </button>
              <span className="min-w-10 border-x border-[#3b4061] px-2 text-center font-mono text-[9px] font-bold text-white">
                {zoom}%
              </span>
              <button
                type="button"
                aria-label="Aumentar zoom"
                onClick={() => setZoom((current) => Math.min(34, current + 2))}
                className="grid h-7 w-7 place-items-center text-[#aeb3c8] hover:text-white"
              >
                +
              </button>
            </div>
            <ToolbarButton icon="expand" onClick={() => setZoom(22)} ariaLabel="Ajustar mapa" />
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="oracle-visual-canvas absolute inset-0 overflow-auto">
            <div
              className="relative"
              style={{
                width: canvasWidth * canvasScale,
                height: canvasHeight * canvasScale,
              }}
            >
              <div
                className={`absolute left-0 top-0 transition-opacity ${mapHydrated ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  transform: `scale(${canvasScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                  fill="none"
                >
                  {screenConnections.map(([fromId, toId]) => {
                    const from = canvasScreens.find((screen) => screen.id === fromId);
                    const to = canvasScreens.find((screen) => screen.id === toId);
                    if (!from || !to) return null;
                    return (
                      <path
                        key={`${fromId}-${toId}`}
                        d={connectionPath(from, to)}
                        stroke="#58617f"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                        opacity="0.72"
                        markerEnd="url(#arrow)"
                      />
                    );
                  })}
                  <defs>
                    <marker
                      id="arrow"
                      markerWidth="7"
                      markerHeight="7"
                      refX="5"
                      refY="3.5"
                      orient="auto"
                    >
                      <path d="M0 0 7 3.5 0 7Z" fill="#58617f" />
                    </marker>
                  </defs>
                </svg>

                {canvasScreens.map((screen, screenIndex) => {
                  const selected = screen.id === selectedScreen.id;
                  const previewFrame = selected ? selectedFrame : frameFor(screen, PRIMARY_FRAME_ID);
                  const screenReady = isScreenReady(screen);
                  const activeDesignJob = designJobs[designJobKey(screen.id, previewFrame.id)];
                  return (
                    <div
                      key={screen.id}
                      className="absolute"
                      style={{
                        left: screen.x,
                        top: screen.y,
                        width: screen.width,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectScreen(screen.id)}
                        className="group block w-full text-left"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                          <span className="truncate text-[9px] font-semibold text-[#c7cada]">
                            {screenIndex + 1}. {screen.title}
                          </span>
                          <span
                            className={`flex items-center gap-1 text-[7px] font-bold ${
                              selected
                                ? 'text-[#ff7048]'
                                : screenReady
                                  ? 'text-[#68d89d]'
                                  : 'text-[#d5a15e]'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                selected
                                  ? 'bg-[#ff5a38]'
                                  : screenReady
                                    ? 'bg-[#4fe092]'
                                    : 'bg-[#d5a15e]'
                              }`}
                            />
                            {selected ? 'Seleccionada' : screenReady ? 'Aprobada' : 'Pendiente'}
                          </span>
                        </div>
                        <div
                          className={`relative overflow-hidden rounded-[5px] bg-[#f5f0e8] shadow-[0_18px_45px_rgba(0,0,0,0.3)] transition ${
                            selected
                              ? 'ring-2 ring-[#ff5a38] ring-offset-2 ring-offset-[#101326]'
                              : 'ring-1 ring-[#444b69] group-hover:ring-[#727b9d]'
                          }`}
                          style={{ height: screen.height }}
                        >
                          <ScreenPreview
                            screen={screenForFrame(screen, previewFrame)}
                            source={previewSource}
                          />
                          <span className="absolute bottom-1.5 right-1.5 rounded bg-[#101326]/88 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-[0.1em] text-white">
                            {previewSource === 'current'
                              ? 'Actual'
                              : `Objetivo v${previewFrame.targetVersion || 0}`}
                          </span>
                        </div>
                      </button>

                      {selected ? (
                        <div className="absolute left-1/2 top-[calc(100%+9px)] z-20 flex -translate-x-1/2 items-center whitespace-nowrap rounded-md border border-[#495170] bg-[#191d35]/95 p-1 shadow-xl backdrop-blur">
                          {(previewSource === 'current'
                            ? previewFrame.currentImageUrl
                            : previewFrame.targetImageUrl) ? (
                            <CanvasAction icon="expand" onClick={() => openSelectedImage(previewSource)}>
                              Abrir
                            </CanvasAction>
                          ) : null}
                          <CanvasAction
                            icon="refresh"
                            onClick={generateVariation}
                            disabled={Boolean(activeDesignJob && isDesignActive(activeDesignJob.status))}
                          >
                            {activeDesignJob && isDesignActive(activeDesignJob.status)
                              ? 'Generando...'
                              : previewFrame.targetImagePath
                                ? 'Regenerar objetivo'
                                : 'Generar objetivo'}
                          </CanvasAction>
                          {previewFrame.targetVersion > 0 ? (
                            <span className="px-2 py-1.5 text-[7px] font-bold text-[#9fa6be]">
                              v{previewFrame.targetVersion}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {!mapHydrated ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[#101326]">
              <div className="rounded-lg border border-[#3b4061] bg-[#171a31] px-5 py-3 text-[10px] font-bold text-[#cbd0df] shadow-xl">
                Cargando mapa y capturas reales…
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-[#3b4061] bg-[#171a31]/95 px-4 py-2 shadow-xl backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="whitespace-nowrap text-[9px] font-semibold text-[#cbd0df]">
                {approvedCount} de {workspaceScreens.length} aprobadas
              </span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#313650]">
                <span
                  className="block h-full rounded-full bg-[#56d493]"
                  style={{ width: `${workspaceScreens.length ? (approvedCount / workspaceScreens.length) * 100 : 0}%` }}
                />
              </span>
            </div>
          </div>

          {feedback ? (
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="absolute bottom-3 right-3 z-30 max-w-[280px] rounded-lg border border-[#4a526e] bg-[#20243e] px-3 py-2 text-left text-[9px] text-[#dce0eb] shadow-xl"
            >
              {feedback}
            </button>
          ) : null}
        </div>
      </main>

      <ScreenInspector
        screen={selectedScreen}
        frame={selectedFrame}
        frames={framesFor(selectedScreen)}
        branchName={branchName}
        approvedCount={approvedCount}
        agentBatch={agentBatch}
        agentLaunching={agentLaunching}
        onSelectFrame={setSelectedFrameId}
        onAddFrame={addFrame}
        onFrameTitleChange={(value) =>
          patchSelectedFrame((frame) => ({ ...frame, title: value }))
        }
        onObjectiveChange={(value) =>
          patchSelectedFrame((frame) => ({ ...frame, objective: value }))
        }
        onInstructionChange={(value) =>
          patchSelectedFrame((frame) => ({ ...frame, instruction: value }))
        }
        onTriggerChange={(trigger) =>
          patchSelectedFrame((frame) => ({ ...frame, trigger }))
        }
        onTransitionChange={(transition) =>
          patchSelectedFrame((frame) => ({ ...frame, transition }))
        }
        onDurationChange={(durationMs) =>
          patchSelectedFrame((frame) => ({ ...frame, durationMs }))
        }
        editingCriterion={editingCriterion}
        criterionDraft={criterionDraft}
        onCriterionDraftChange={setCriterionDraft}
        onEditCriterion={(index) => {
          setEditingCriterion(index);
          setCriterionDraft(selectedFrame.criteria[index] ?? '');
        }}
        onSaveCriterion={saveCriterion}
        addingCriterion={addingCriterion}
        newCriterion={newCriterion}
        onNewCriterionChange={setNewCriterion}
        onStartAddingCriterion={() => setAddingCriterion(true)}
        onAddCriterion={addCriterion}
        onCancelAddingCriterion={() => {
          setAddingCriterion(false);
          setNewCriterion('');
        }}
        onToggleApproved={toggleApproved}
        onReplaceImage={() => fileInputRef.current?.click()}
        onRecapture={recaptureSelectedFrame}
        captureBusy={captureBusy}
        onOpenImage={openSelectedImage}
        onGenerate={generateVariation}
        designJob={selectedDesignJob}
        instructionInputRef={instructionInputRef}
        onSaveMap={saveMap}
        onPrepare={prepareScreens}
        onCancelRun={cancelSelectedRun}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={replaceImage}
        className="hidden"
      />

      {imageViewer ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${imageViewer.label}: ${imageViewer.title}`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070914]/92 p-5 backdrop-blur-sm"
          onClick={() => setImageViewer(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-[#424966] bg-[#12152a] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#343a59] px-4 py-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#ff7654]">{imageViewer.label}</p>
                <h2 className="mt-1 text-sm font-black text-white">{imageViewer.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setImageViewer(null)}
                className="grid h-8 w-8 place-items-center rounded-md border border-[#454c69] text-lg text-[#c5cada] hover:border-[#ff6844] hover:text-white"
                aria-label="Cerrar imagen"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#0c0f20] p-3">
              <img
                src={imageViewer.url}
                alt={imageViewer.title}
                className="mx-auto h-auto w-full max-w-[1280px] object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScreenInspector({
  screen,
  frame,
  frames,
  branchName,
  approvedCount,
  agentBatch,
  agentLaunching,
  onSelectFrame,
  onAddFrame,
  onFrameTitleChange,
  onObjectiveChange,
  onInstructionChange,
  onTriggerChange,
  onTransitionChange,
  onDurationChange,
  editingCriterion,
  criterionDraft,
  onCriterionDraftChange,
  onEditCriterion,
  onSaveCriterion,
  addingCriterion,
  newCriterion,
  onNewCriterionChange,
  onStartAddingCriterion,
  onAddCriterion,
  onCancelAddingCriterion,
  onToggleApproved,
  onReplaceImage,
  onRecapture,
  captureBusy,
  onOpenImage,
  onGenerate,
  designJob,
  instructionInputRef,
  onSaveMap,
  onPrepare,
  onCancelRun,
}: {
  screen: VisualScreen;
  frame: VisualFrame;
  frames: VisualFrame[];
  branchName: string;
  approvedCount: number;
  agentBatch: AgentBatch | null;
  agentLaunching: boolean;
  onSelectFrame: (id: string) => void;
  onAddFrame: () => void;
  onFrameTitleChange: (value: string) => void;
  onObjectiveChange: (value: string) => void;
  onInstructionChange: (value: string) => void;
  onTriggerChange: (trigger: FrameTrigger) => void;
  onTransitionChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  editingCriterion: number | null;
  criterionDraft: string;
  onCriterionDraftChange: (value: string) => void;
  onEditCriterion: (index: number) => void;
  onSaveCriterion: (index: number) => void;
  addingCriterion: boolean;
  newCriterion: string;
  onNewCriterionChange: (value: string) => void;
  onStartAddingCriterion: () => void;
  onAddCriterion: () => void;
  onCancelAddingCriterion: () => void;
  onToggleApproved: () => void;
  onReplaceImage: () => void;
  onRecapture: () => void;
  captureBusy: boolean;
  onOpenImage: (source: 'current' | 'target' | 'display') => void;
  onGenerate: () => void;
  designJob?: DesignJob;
  instructionInputRef: RefObject<HTMLTextAreaElement>;
  onSaveMap: () => void | Promise<void>;
  onPrepare: () => void;
  onCancelRun: () => void;
}) {
  const batchActive = agentBatch?.status === 'preparing' || agentBatch?.status === 'running';
  const selectedRun = agentBatch?.runs.find((run) => run.taskId === screen.id);
  const activeRuns = agentBatch?.runs.filter(
    (run) => run.status === 'running' || run.status === 'preparing' || run.status === 'queued',
  ).length;

  return (
    <aside className="hidden min-h-0 border-l border-[#343a59]/75 bg-[#12152a] xl:flex xl:h-screen xl:flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <h2 className="text-base font-black text-white">Pantalla seleccionada</h2>

        <section className="mt-3 rounded-lg border border-[#3b4061]/80 bg-[#1a1e36] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-white">{screen.title}</h3>
              <p className="mt-1 font-mono text-[9px] text-[#b5bacd]">{screen.route}</p>
            </div>
            <Icon name="copy" className="h-3.5 w-3.5 flex-none text-[#8f96af]" />
          </div>
        </section>

        <section className="mt-2.5 rounded-lg border border-[#3b4061]/80 bg-[#1a1e36] p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-black text-white">Secuencia</h3>
            <button
              type="button"
              onClick={onAddFrame}
              className="inline-flex items-center gap-1 text-[8px] font-bold text-[#ff7048] hover:text-[#ff9a7d]"
            >
              <Icon name="plus" className="h-3 w-3" /> Fotograma
            </button>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {frames.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                onClick={() => onSelectFrame(candidate.id)}
                className={`min-w-[74px] rounded-md border px-2 py-1.5 text-left transition ${
                  candidate.id === frame.id
                    ? 'border-[#ff5a38] bg-[#2b2233]'
                    : 'border-[#3b4061] bg-[#15182e] hover:border-[#59617f]'
                }`}
              >
                <span className="block truncate text-[8px] font-black text-white">
                  {candidate.order}. {candidate.title}
                </span>
                <span className={`mt-0.5 block text-[7px] ${candidate.approved ? 'text-[#67d99b]' : 'text-[#8f96af]'}`}>
                  {candidate.targetVersion > 0 ? `v${candidate.targetVersion}` : 'Sin imagen'}
                </span>
              </button>
            ))}
          </div>

          <input
            value={frame.title}
            onChange={(event) => onFrameTitleChange(event.target.value)}
            aria-label="Nombre del fotograma"
            className="mt-2 w-full rounded-md border border-[#414866] bg-[#14172d] px-2.5 py-1.5 text-[9px] font-bold text-white outline-none focus:border-[#ff5a38]"
          />

          {frame.order > 1 ? (
            <div className="mt-2 grid grid-cols-[1fr_70px] gap-1.5">
              <select
                value={frame.trigger}
                onChange={(event) => onTriggerChange(event.target.value as FrameTrigger)}
                aria-label="Disparador de transición"
                className="rounded-md border border-[#414866] bg-[#14172d] px-2 py-1.5 text-[8px] text-white outline-none focus:border-[#ff5a38]"
              >
                <option value="automatic">Automática</option>
                <option value="interaction">Interacción</option>
                <option value="scroll">Scroll</option>
              </select>
              <input
                type="number"
                min={100}
                max={10000}
                step={50}
                value={frame.durationMs}
                onChange={(event) => onDurationChange(Number(event.target.value))}
                aria-label="Duración en milisegundos"
                className="rounded-md border border-[#414866] bg-[#14172d] px-2 py-1.5 text-[8px] text-white outline-none focus:border-[#ff5a38]"
              />
              <input
                value={frame.transition}
                onChange={(event) => onTransitionChange(event.target.value)}
                aria-label="Descripción de la transición"
                className="col-span-2 rounded-md border border-[#414866] bg-[#14172d] px-2 py-1.5 text-[8px] text-white outline-none focus:border-[#ff5a38]"
              />
            </div>
          ) : null}
        </section>

        <section className="mt-2.5 rounded-lg border border-[#3b4061]/80 bg-[#1a1e36] p-3">
          <div className="flex items-center justify-between">
            <label htmlFor="screen-objective" className="font-black text-white">
              Objetivo
            </label>
            <Icon name="edit" className="h-3.5 w-3.5 text-[#8f96af]" />
          </div>
          <textarea
            id="screen-objective"
            value={frame.objective}
            onChange={(event) => onObjectiveChange(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-md border border-[#414866] bg-[#14172d] px-2.5 py-2 text-[10px] leading-[15px] text-[#eef0f5] outline-none focus:border-[#ff5a38]"
          />
        </section>

        <section className="mt-2.5 rounded-lg border border-[#3b4061]/80 bg-[#1a1e36] p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-black text-white">Referencias</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRecapture}
                disabled={captureBusy}
                className="text-[8px] font-bold text-[#ff7048] hover:text-[#ff9a7d] disabled:cursor-wait disabled:text-[#7b5960]"
              >
                {captureBusy ? 'Capturando…' : 'Recapturar'}
              </button>
              <button
                type="button"
                onClick={onReplaceImage}
                className="text-[8px] font-bold text-[#ff7048] hover:text-[#ff9a7d]"
              >
                Reemplazar
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ReferencePreview
              screen={screen}
              frame={frame}
              label="Actual"
              source="current"
              onOpen={() => onOpenImage('current')}
            />
            <ReferencePreview
              screen={screen}
              frame={frame}
              label="Objetivo"
              source="target"
              selected
              onOpen={() => onOpenImage('target')}
            />
          </div>

          <label htmlFor="design-instruction" className="mt-3 block text-[8px] font-black uppercase tracking-[0.1em] text-[#aeb4c9]">
            Qué quieres cambiar
          </label>
          <textarea
            ref={instructionInputRef}
            id="design-instruction"
            value={frame.instruction ?? ''}
            onChange={(event) => onInstructionChange(event.target.value)}
            rows={3}
            placeholder="Ej. Conserva la estructura, amplía el hero y usa una composición más editorial."
            className="mt-1.5 w-full resize-none rounded-md border border-[#414866] bg-[#14172d] px-2.5 py-2 text-[9px] leading-[14px] text-white outline-none placeholder:text-[#68708b] focus:border-[#ff5a38]"
          />
          <button
            type="button"
            onClick={onGenerate}
            disabled={Boolean(designJob && isDesignActive(designJob.status))}
            className="mt-2 flex min-h-8 w-full items-center justify-center gap-2 rounded-md bg-[#ff5a38] px-3 text-[9px] font-black text-[#1b1010] transition hover:bg-[#ff7654] disabled:cursor-wait disabled:bg-[#6b3a35] disabled:text-[#c89186]"
          >
            <Icon name="refresh" className="h-3 w-3" />
            {designJob && isDesignActive(designJob.status)
              ? designJob.currentActivity ?? 'Generando imagen…'
              : frame.targetImagePath
                ? 'Generar variación'
                : 'Generar objetivo'}
          </button>
          {designJob && !isDesignActive(designJob.status) ? (
            <p className={`mt-1.5 text-[8px] ${designJob.status === 'succeeded' ? 'text-[#67d99b]' : 'text-[#e8a38f]'}`}>
              {designJob.summary}
            </p>
          ) : null}
        </section>

        <section className="mt-2.5 rounded-lg border border-[#3b4061]/80 bg-[#1a1e36] p-3">
          <h3 className="font-black text-white">Criterios</h3>
          <div className="mt-2 space-y-1.5">
            {frame.criteria.map((criterion, index) =>
              editingCriterion === index ? (
                <div key={`${screen.id}-${index}`} className="flex gap-1.5">
                  <input
                    value={criterionDraft}
                    onChange={(event) => onCriterionDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onSaveCriterion(index);
                    }}
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border border-[#ff5a38] bg-[#14172d] px-2 py-1.5 text-[9px] text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onSaveCriterion(index)}
                    className="rounded-md bg-[#ff5a38] px-2 text-[8px] font-black text-[#1c1010]"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  key={`${screen.id}-${criterion}`}
                  onClick={() => onEditCriterion(index)}
                  className="flex w-full items-center gap-2 rounded-md border border-[#343a59] bg-[#20243e] px-2 py-2 text-left text-[9px] text-[#ececf2] hover:border-[#555e7e]"
                >
                  <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-[#ff6844] text-[#1a1111]">
                    <Icon name="check" className="h-2.5 w-2.5" />
                  </span>
                  <span className="min-w-0 flex-1">{criterion}</span>
                  <Icon name="edit" className="h-3 w-3 flex-none text-[#8990aa]" />
                </button>
              ),
            )}
          </div>

          {addingCriterion ? (
            <div className="mt-2 flex gap-1.5">
              <input
                value={newCriterion}
                onChange={(event) => onNewCriterionChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onAddCriterion();
                  if (event.key === 'Escape') onCancelAddingCriterion();
                }}
                autoFocus
                placeholder="Nuevo criterio"
                className="min-w-0 flex-1 rounded-md border border-[#ff5a38] bg-[#14172d] px-2 py-1.5 text-[9px] text-white outline-none"
              />
              <button
                type="button"
                onClick={onAddCriterion}
                className="rounded-md bg-[#ff5a38] px-2 text-[8px] font-black text-[#1c1010]"
              >
                Añadir
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartAddingCriterion}
              className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-black text-[#ff7048] hover:text-[#ff9a7d]"
            >
              <Icon name="plus" className="h-3 w-3" /> Añadir criterio
            </button>
          )}
        </section>

        <button
          type="button"
          onClick={onToggleApproved}
          className={`mt-2.5 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[10px] font-black transition ${
            frame.approved
              ? 'border-[#246145] bg-[#14362b] text-[#7de2ad]'
              : 'border-[#674d36] bg-[#35291f] text-[#e8b477]'
          }`}
        >
          <span className="grid h-5 w-5 place-items-center rounded-full border border-current">
            <Icon name={frame.approved ? 'check' : 'pulse'} className="h-3 w-3" />
          </span>
          {frame.approved ? 'Fotograma aprobado' : 'Aprobar fotograma'}
        </button>

        <p className="mt-2 truncate px-1 font-mono text-[7px] text-[#6f7691]" title={branchName}>
          {branchName}
        </p>
      </div>

      <div className="space-y-2 border-t border-[#343a59]/75 p-3">
        {agentBatch && (batchActive || agentBatch.status === 'partial' || agentBatch.status === 'blocked') ? (
          <div className="rounded-md border border-[#3b4061] bg-[#191d35] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[8px] font-black uppercase tracking-[0.08em] text-[#aeb4c9]">
                {agentBatch.mode === 'discover' ? 'Descubrimiento' : 'Lote paralelo'}
              </span>
              <span className="text-[8px] font-bold text-[#ff8061]">
                {batchActive ? `${activeRuns} activos` : batchStatusLabel(agentBatch.status)}
              </span>
            </div>
            {selectedRun ? (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[8px] text-[#d7dae5]">
                  {selectedRun.currentActivity ?? selectedRun.summary}
                </span>
                {selectedRun.status === 'running' ? (
                  <button
                    type="button"
                    onClick={onCancelRun}
                    className="flex-none text-[8px] font-black text-[#ff8061] hover:text-white"
                  >
                    Detener
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onPrepare}
          disabled={approvedCount === 0 || batchActive || agentLaunching}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#ff4f32] px-3 py-3 text-[10px] font-black text-white shadow-[0_10px_25px_rgba(255,79,50,0.2)] transition hover:bg-[#ff6848] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {agentBatch?.mode === 'implement' && batchActive
            ? 'Agentes trabajando'
            : agentLaunching
              ? 'Preparando worktrees'
              : `Preparar ${approvedCount} pantallas`}{' '}
          <Icon name="arrow-right" className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onSaveMap}
          className="w-full rounded-md border border-[#4a516f] bg-[#171a31] px-3 py-2.5 text-[10px] font-black text-white hover:border-[#697291]"
        >
          Guardar mapa
        </button>
      </div>
    </aside>
  );
}

function ReferencePreview({
  screen,
  frame,
  label,
  source,
  selected = false,
  onOpen,
}: {
  screen: VisualScreen;
  frame: VisualFrame;
  label: string;
  source: 'current' | 'target';
  selected?: boolean;
  onOpen: () => void;
}) {
  const framedScreen = screenForFrame(screen, frame);
  const imageUrl = source === 'current' ? framedScreen.currentImageUrl : framedScreen.targetImageUrl;
  return (
    <div>
      <button
        type="button"
        onClick={onOpen}
        disabled={!imageUrl}
        className={`group relative block h-[112px] w-full overflow-hidden rounded-md bg-[#f4f0e8] text-left ${
          selected ? 'ring-1 ring-[#ff5a38]' : 'ring-1 ring-[#444b67]'
        } disabled:cursor-default`}
      >
        <ScreenPreview screen={framedScreen} source={source} />
        {imageUrl ? (
          <span className="absolute inset-x-2 bottom-2 rounded bg-[#11152b]/88 px-2 py-1 text-center text-[7px] font-black uppercase tracking-[0.1em] text-white opacity-0 transition group-hover:opacity-100">
            Abrir imagen
          </span>
        ) : null}
      </button>
      <p className="mt-1.5 text-[8px] text-[#aeb3c7]">{label}</p>
    </div>
  );
}

function ScreenPreview({
  screen,
  source = 'display',
}: {
  screen: VisualScreen;
  source?: 'current' | 'target' | 'display';
}) {
  const imageUrl =
    source === 'current'
      ? screen.currentImageUrl
      : source === 'target'
        ? screen.targetImageUrl
        : screen.targetImageUrl ?? screen.currentImageUrl;
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={screen.title}
        className="h-full w-full bg-white object-contain object-top"
      />
    );
  }

  return (
    <div className="flex h-full flex-col justify-between bg-[#171a2d] p-4 text-[#aeb4c8]">
      <span className="text-[6px] font-black uppercase tracking-[0.16em] text-[#ff7654]">
        {source === 'current'
          ? 'Sin captura real'
          : source === 'target'
            ? 'Sin diseño objetivo'
            : screen.currentCaptureState === 'real'
              ? 'Falta diseño objetivo'
              : 'Sin referencia visual'}
      </span>
      <span className="break-all font-mono text-[7px] leading-relaxed">{screen.route}</span>
    </div>
  );
}

function previewHeightForScreen(screen: VisualScreen, source: PreviewSource) {
  const width = source === 'current' ? screen.currentWidth : screen.targetWidth;
  const height = source === 'current' ? screen.currentHeight : screen.targetHeight;
  if (!width || !height) return 190;
  const proportionalHeight = Math.round(screen.width * (height / width));
  return Math.max(190, Math.min(720, proportionalHeight));
}

function PreviewHeader() {
  return (
    <div className="flex h-7 flex-none items-center justify-between border-b border-black/10 bg-[#fffdf9] px-3 text-[5px] font-semibold uppercase tracking-wide">
      <span className="font-black tracking-[0.12em]">SHYNOLASER</span>
      <span className="text-black/50">Productos · Materiales · Aplicaciones</span>
    </div>
  );
}

function CatalogPreview({ variation }: { variation: number }) {
  const items = variation % 2 === 0 ? ['Corte', 'Grabado', 'Marcado', 'Piezas'] : ['Metal', 'Madera', 'Acrílico', 'Textil'];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`grid min-h-[122px] flex-[1.15] ${variation % 2 ? 'grid-cols-[0.92fr_1.08fr]' : 'grid-cols-[1.08fr_0.92fr]'}`}>
        <div className={`flex flex-col justify-center bg-[#151719] p-4 text-white ${variation % 2 ? 'order-2' : ''}`}>
          <span className="text-[5px] font-bold uppercase tracking-[0.13em] text-[#ff8b65]">Corte láser de precisión</span>
          <strong className="mt-2 max-w-[12ch] font-serif text-[17px] leading-[0.92]">Corte láser y grabado de alta precisión</strong>
          <span className="mt-3 h-5 w-16 rounded-sm bg-[#f15a38]" />
        </div>
        <LaserArtwork className={variation % 2 ? 'order-1' : ''} />
      </div>
      <PreviewSection title="Servicios destacados" items={items} />
      <PreviewSection title="Materiales" items={['Madera', 'Acrílico', 'Cuero', 'Metal']} warm />
      <PreviewSection title="Proyectos populares" items={['Letreros', 'Cajas', 'Placas', 'Regalos']} />
      <div className="mt-auto grid min-h-[58px] grid-cols-[1fr_auto] items-center gap-3 bg-[#fffdf9] px-4 py-3">
        <div>
          <strong className="block font-serif text-[9px]">¿Tienes un proyecto especial?</strong>
          <span className="text-[5px] text-black/50">Cuéntanos tu idea y la hacemos realidad.</span>
        </div>
        <span className="h-5 w-16 rounded-sm bg-[#f15a38]" />
      </div>
      <div className="h-14 flex-none bg-[#17191c] px-4 py-3 text-[5px] text-white/65">SHYNOLASER · Servicios · Materiales · Contacto</div>
    </div>
  );
}

function CategoryPreview({ title, variation }: { title: string; variation: number }) {
  const products = title.includes('grabables')
    ? ['Tabla', 'Portavasos', 'Placa', 'Botella', 'Llavero', 'Caja']
    : ['Parche', 'Llavero', 'Etiqueta', 'Brazalete', 'Cinturón', 'Cartera'];
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <span className="text-[5px] font-bold uppercase tracking-[0.12em] text-[#c34f32]">Colección personalizada</span>
      <strong className="mt-1 font-serif text-[14px] leading-none">{title}</strong>
      <p className="mt-1 text-[5px] leading-tight text-black/55">Piezas creadas con precisión para proyectos con identidad.</p>
      <div className="mt-2 flex gap-1">
        {['Todos', 'Madera', 'Metal', 'Cuero'].map((tag, index) => (
          <span key={tag} className={`rounded px-1.5 py-1 text-[4px] ${index === variation % 4 ? 'bg-[#17191c] text-white' : 'border border-black/10 bg-white'}`}>{tag}</span>
        ))}
      </div>
      <div className="mt-3 grid flex-1 grid-cols-3 gap-2">
        {products.map((product, index) => (
          <div key={product} className="overflow-hidden rounded-sm bg-white shadow-sm">
            <ProductArtwork index={index + variation} />
            <div className="p-1.5">
              <strong className="block text-[5px]">{product}</strong>
              <span className="text-[4px] text-black/50">Desde $490</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-1 w-full rounded bg-black/5"><span className="block h-full w-2/3 rounded bg-[#f15a38]" /></div>
    </div>
  );
}

function DetailPreview({ variation }: { variation: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <span className="text-[5px] font-bold uppercase tracking-[0.12em] text-[#c34f32]">Servicio especializado</span>
      <strong className="mt-1 font-serif text-[15px] leading-none">Corte láser en madera</strong>
      <div className={`mt-3 overflow-hidden rounded-sm ${variation % 2 ? 'h-[38%]' : 'h-[32%]'}`}><LaserArtwork /></div>
      <p className="mt-2 text-[5px] leading-relaxed text-black/55">Corte de alta precisión para señalética, mobiliario, prototipos y acabados personalizados.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {['Corte preciso', 'Múltiples espesores', 'Acabado profesional', 'Entrega rápida'].map((item) => (
          <div key={item} className="rounded border border-black/10 bg-white p-2"><strong className="text-[5px] text-[#b8482e]">{item}</strong><span className="mt-1 block h-1 w-3/4 rounded bg-black/10" /></div>
        ))}
      </div>
      <PreviewSection title="Ejemplos de trabajos" items={['Árbol', 'Mapa', 'Panel', 'Medalla']} compact />
      <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-3"><strong className="font-serif text-[12px]">$4,900</strong><span className="h-6 w-20 rounded-sm bg-[#f15a38]" /></div>
    </div>
  );
}

function QuotePreview({ variation }: { variation: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <div className="flex items-center justify-between text-[4px] text-black/45"><span className="font-bold text-[#c34f32]">1. Servicio</span><span>2. Detalles</span><span>3. Revisión</span></div>
      <div className="mt-3">
        <span className="text-[5px] font-bold uppercase tracking-[0.1em] text-[#b8482e]">1. Selecciona el servicio</span>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {['Corte', 'Grabado', 'Marcado', 'Otro'].map((item, index) => (
            <span key={item} className={`rounded border px-1 py-2 text-center text-[4px] ${index === variation % 4 ? 'border-[#f15a38] bg-[#fff0ea]' : 'border-black/10 bg-white'}`}>{item}</span>
          ))}
        </div>
      </div>
      <strong className="mt-4 font-serif text-[11px]">Cuéntanos tu proyecto</strong>
      <div className="mt-2 space-y-2">
        <span className="block h-7 rounded border border-black/10 bg-white" />
        <span className="block h-11 rounded border border-black/10 bg-white" />
        <span className="flex h-7 items-center justify-center rounded border border-dashed border-black/20 bg-white text-[4px] text-black/40">Subir referencia</span>
      </div>
      <span className="ml-auto mt-auto h-6 w-20 rounded-sm bg-[#f15a38]" />
    </div>
  );
}

function ContactPreview() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[0.9fr_1.1fr] gap-3 p-3">
      <div>
        <strong className="font-serif text-[13px]">Contáctanos</strong>
        <p className="mt-1 text-[5px] text-black/50">Estamos listos para ayudarte con tu proyecto.</p>
        <div className="mt-3 space-y-2 text-[5px] text-[#a6432d]"><p>Escríbenos</p><p>Llámanos</p><p>Ubicación</p><p>Horario</p></div>
      </div>
      <div className="space-y-2 rounded-sm bg-white p-2 shadow-sm"><span className="block h-5 rounded bg-black/5" /><span className="block h-5 rounded bg-black/5" /><span className="block h-9 rounded bg-black/5" /><span className="ml-auto block h-5 w-16 rounded bg-[#f15a38]" /></div>
    </div>
  );
}

function AdminPreview({ kind, variation }: { kind: 'admin-list' | 'admin-detail'; variation: number }) {
  return (
    <div className="grid h-full grid-cols-[44px_1fr] bg-[#f7f4ee] text-[#17191c]">
      <div className="bg-[#1c1f26] p-2 text-[4px] text-white/60"><strong className="block text-[5px] text-white">Panel</strong><div className="mt-4 space-y-3"><span className="block text-[#ff7958]">Catálogo</span><span className="block">Pedidos</span><span className="block">Clientes</span><span className="block">Ajustes</span></div></div>
      {kind === 'admin-list' ? (
        <div className="p-3"><div className="flex items-center justify-between"><strong className="text-[9px]">Catálogo</strong><span className="h-5 w-14 rounded-sm bg-[#f15a38]" /></div><div className="mt-3 h-5 rounded border border-black/10 bg-white" /><div className="mt-3 space-y-2">{['Puerta cuero', 'Llavero inicial', 'Tabla madera', 'Corte láser', 'Grabado metal'].map((item, index) => <div key={item} className="grid grid-cols-[1fr_0.7fr_0.5fr] border-b border-black/8 pb-2 text-[4px]"><span>{item}</span><span>{index % 2 ? 'Atelier' : 'Servicios'}</span><span className={index === variation % 5 ? 'text-[#df5838]' : 'text-[#43845f]'}>Publicado</span></div>)}</div></div>
      ) : (
        <div className="p-3"><div className="flex items-center justify-between"><strong className="text-[9px]">Editar producto</strong><span className="rounded border border-black/10 bg-white px-2 py-1 text-[4px]">Ver producto</span></div><div className="mt-3 grid grid-cols-[1fr_0.8fr] gap-3"><div className="space-y-2">{['Nombre', 'Categoría', 'Precio', 'SKU'].map((item) => <div key={item}><span className="block text-[4px] text-black/50">{item}</span><span className="mt-0.5 block h-5 rounded border border-black/10 bg-white" /></div>)}</div><div><span className="block text-[4px] text-black/50">Imagen principal</span><ProductArtwork index={variation + 2} /><div className="mt-2 grid grid-cols-3 gap-1"><ProductArtwork index={1} /><ProductArtwork index={2} /><ProductArtwork index={3} /></div></div></div><span className="ml-auto mt-4 block h-6 w-20 rounded-sm bg-[#f15a38]" /></div>
      )}
    </div>
  );
}

function PreviewSection({
  title,
  items,
  warm = false,
  compact = false,
}: {
  title: string;
  items: string[];
  warm?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? 'mt-3' : 'border-b border-black/8 px-4 py-3'} ${warm ? 'bg-[#eee5d6]' : 'bg-[#f8f4ec]'}`}>
      <strong className="block text-[6px]">{title}</strong>
      <div className={`mt-2 grid grid-cols-4 ${compact ? 'gap-1' : 'gap-2'}`}>
        {items.map((item, index) => (
          <div key={item} className="overflow-hidden rounded-sm bg-white shadow-sm"><ProductArtwork index={index} /><span className="block truncate px-1 py-1 text-[4px] font-bold">{item}</span></div>
        ))}
      </div>
    </div>
  );
}

function ProductArtwork({ index }: { index: number }) {
  const backgrounds = [
    'linear-gradient(145deg,#c99b61,#6f4525)',
    'radial-gradient(circle at 50% 45%,#c89455 0 18%,#513522 20% 45%,#b78149 47%)',
    'linear-gradient(35deg,#282827,#857258 48%,#2a2a28)',
    'radial-gradient(circle,#d0a061 0 20%,#6b4325 22% 38%,#d3a76f 40%)',
  ];
  return <span className="block h-[55%] min-h-8 w-full" style={{ background: backgrounds[Math.abs(index) % backgrounds.length] }} />;
}

function LaserArtwork({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[linear-gradient(145deg,#141517_20%,#5b321f_70%,#171819)] ${className}`}>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_68%_43%,#fff0a5_0,transparent_2.5%),radial-gradient(circle_at_67%_45%,#ff7a2d_0,transparent_12%)]" />
      <span className="absolute bottom-[27%] right-[12%] h-[2px] w-[58%] rotate-[-18deg] bg-[#f5a249] shadow-[0_0_12px_#ff6c26]" />
      <span className="absolute bottom-0 left-0 right-0 h-[24%] bg-[#8a5a31]/75" />
    </div>
  );
}

function GlobalNavigation() {
  const items: Array<{ to: string; label: string; icon: IconName; active?: boolean }> = [
    { to: '/operations', label: 'Inicio', icon: 'home' },
    { to: '/projects', label: 'Proyectos', icon: 'folder', active: true },
    { to: '/requests', label: 'Clientes', icon: 'users' },
    { to: '/operations', label: 'Actividad', icon: 'pulse' },
    { to: '/operations', label: 'Configuración', icon: 'settings' },
  ];
  return (
    <aside className="hidden border-r border-[#343a59]/75 bg-[#0d1020] xl:flex xl:h-screen xl:flex-col">
      <Link to="/projects" className="grid h-[58px] place-items-center border-b border-[#343a59]/50">
        <img src="/assets/lmwares-logo.png" alt="LMWARES" className="h-10 w-10 rounded-md object-cover shadow-lg" />
      </Link>
      <nav className="space-y-2 px-2 py-4">
        {items.map((item) => (
          <Link key={`${item.label}-${item.to}`} to={item.to} title={item.label} className={`grid h-10 place-items-center rounded-md border-l-2 transition ${item.active ? 'border-[#ff5a38] bg-[#452332] text-[#ff8061]' : 'border-transparent text-[#9da3ba] hover:bg-white/5 hover:text-white'}`}>
            <Icon name={item.icon} className="h-4 w-4" />
          </Link>
        ))}
      </nav>
      <div className="mt-auto grid place-items-center p-3"><span className="grid h-8 w-8 place-items-center rounded-full border border-[#4b526e] text-[9px] font-black text-white">LM</span></div>
    </aside>
  );
}

function ProjectRail({ activeProject }: { activeProject: string }) {
  const projects = Array.from(new Set([activeProject, ...PROJECTS]));
  return (
    <aside className="hidden border-r border-[#343a59]/75 bg-[#12152a] xl:flex xl:h-screen xl:flex-col">
      <div className="flex h-[58px] items-center justify-between px-3"><h2 className="text-sm font-black text-white">Proyectos</h2><Link to="/projects" className="grid h-7 w-7 place-items-center rounded-md border border-[#343a59] bg-[#20243e] text-sm text-white">+</Link></div>
      <div className="space-y-2 px-2.5">
        {projects.slice(0, 3).map((project) => {
          const active = project === activeProject;
          return (
            <Link key={project} to={`/projects/prepare?name=${encodeURIComponent(project)}`} className={`block rounded-lg border p-2.5 transition ${active ? 'border-[#59617e] bg-[#1d213a]' : 'border-[#343a59]/75 bg-[#181b32] hover:border-[#4b536f]'}`}>
              <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-black text-white">{project}</p><Icon name="star" className="h-3 w-3 flex-none text-[#8088a3]" /></div>
              <p className="mt-2 text-[7px] font-black uppercase tracking-[0.12em] text-[#ff7048]">Desarrollo</p>
            </Link>
          );
        })}
      </div>
      <Link to="/projects" className="mx-2.5 mb-3 mt-auto flex items-center gap-2 rounded-md border border-[#343a59] bg-[#1a1e36] px-3 py-2.5 text-[9px] font-semibold text-[#d4d7e2]"><Icon name="folder" className="h-3.5 w-3.5" /> Ver archivos</Link>
    </aside>
  );
}

function ToolbarButton({
  children,
  icon,
  onClick,
  ariaLabel,
  disabled = false,
}: {
  children?: ReactNode;
  icon: IconName;
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} disabled={disabled} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#3b4061] bg-[#191d35] px-2.5 text-[9px] font-bold text-[#e5e7ee] hover:border-[#5d6687] hover:bg-[#222641] disabled:cursor-not-allowed disabled:opacity-50">
      <Icon name={icon} className="h-3.5 w-3.5" />{children}
    </button>
  );
}

function CanvasAction({
  children,
  icon,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1 border-r border-[#3b4061] px-2 py-1.5 text-[7px] font-bold text-[#d6d9e4] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 last:border-r-0">
      <Icon name={icon} className="h-3 w-3" />{children}
    </button>
  );
}

function connectionPath(from: VisualScreen, to: VisualScreen) {
  const fromX = from.x + from.width;
  const fromY = from.y + 24 + from.height / 2;
  const toX = to.x;
  const toY = to.y + 24 + to.height / 2;

  if (to.x >= from.x + from.width) {
    const middle = fromX + (toX - fromX) / 2;
    return `M ${fromX + 4} ${fromY} C ${middle} ${fromY}, ${middle} ${toY}, ${toX - 6} ${toY}`;
  }

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height + 30;
  const endX = to.x + to.width / 2;
  const endY = to.y + 12;
  const middleY = startY + (endY - startY) / 2;
  return `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`;
}

function screensFromDiscovery(
  sections: DiscoveredSection[],
  current: VisualScreen[],
): VisualScreen[] {
  const columns = [35, 315, 595, 875];
  const columnHeights = [38, 38, 38, 38];

  return sections.slice(0, 40).map((section, index) => {
    const previous = current.find(
      (screen) => screen.id === section.id || screen.route === section.route,
    );
    const kind = visualKindFor(section);
    const height =
      kind === 'catalog'
        ? 570
        : kind === 'detail'
          ? 490
          : kind === 'quote'
            ? 300
            : kind === 'contact'
              ? 210
              : 260;
    const column = columnHeights.indexOf(Math.min(...columnHeights));
    const screen: VisualScreen = {
      ...previous,
      id: section.id,
      order: index + 1,
      title: section.title,
      route: section.route,
      kind,
      x: columns[column]!,
      y: columnHeights[column]!,
      width: section.app === 'admin-web' ? 250 : 225,
      height,
      objective: section.objective,
      criteria: section.criteria,
      variation: previous?.variation ?? 0,
      approved: false,
      targetVersion: previous?.targetVersion ?? 0,
      app: section.app,
      sourceFiles: section.sourceFiles,
      dependencies: section.dependencies,
    };
    columnHeights[column] = (columnHeights[column] ?? 38) + height + 82;
    return screen;
  });
}

function applyProjectCaptures(
  screens: VisualScreen[],
  captures: ProjectCapture[],
): VisualScreen[] {
  const withCaptures = screens.map((screen) => {
    let current: VisualScreen = {
      ...screen,
      currentImageUrl: undefined,
      currentImagePath: undefined,
      currentWidth: undefined,
      currentHeight: undefined,
      currentCaptureState: 'missing',
      frames: screen.frames?.map((frame) => ({
        ...frame,
        currentImageUrl: undefined,
        currentImagePath: undefined,
        currentWidth: undefined,
        currentHeight: undefined,
        currentCaptureState: 'missing',
      })),
    };
    for (const capture of captures.filter((entry) => entry.screenId === screen.id)) {
      const frameId = normalizeFrameId(capture.frameId);
      if (
        frameId !== PRIMARY_FRAME_ID &&
        !current.frames?.some((frame) => frame.id === frameId)
      ) {
        continue;
      }
      current = updateFrame(current, frameId, (frame) => ({
        ...frame,
        currentImageUrl: capture.imageUrl,
        currentImagePath: capture.imagePath,
        currentWidth: capture.width,
        currentHeight: capture.height,
        currentCaptureState: 'real',
      }));
    }
    return current;
  });
  return reflowScreens(withCaptures);
}

function applyProjectTargets(
  screens: VisualScreen[],
  targets: ProjectTarget[],
): VisualScreen[] {
  const withTargets = screens.map((screen) => {
    const screenTargets = targets.filter((target) => target.screenId === screen.id);
    return screenTargets.reduce((current, target) => {
      const frameId = normalizeFrameId(target.frameId);
      if (
        frameId !== PRIMARY_FRAME_ID &&
        !current.frames?.some((frame) => frame.id === frameId)
      ) {
        return current;
      }
      const existing = frameFor(current, frameId);
      const sameApprovedVersion = existing.targetVersion === target.version;
      return {
        ...updateFrame(current, frameId, (frame) => ({
          ...frame,
          targetImageUrl: target.imageUrl,
          targetImagePath: target.imagePath,
          targetWidth: target.width,
          targetHeight: target.height,
          targetSource: target.source,
          targetVersion: target.version,
          approved: sameApprovedVersion ? frame.approved : false,
        })),
      };
    }, screen);
  });
  return reflowScreens(withTargets);
}

function framesFor(screen: VisualScreen): VisualFrame[] {
  return [frameFor(screen, PRIMARY_FRAME_ID), ...(screen.frames ?? [])]
    .filter((frame): frame is VisualFrame => Boolean(frame))
    .sort((left, right) => left.order - right.order);
}

function frameFor(screen: VisualScreen, frameId: string): VisualFrame {
  if (normalizeFrameId(frameId) === PRIMARY_FRAME_ID) {
    return {
      id: PRIMARY_FRAME_ID,
      order: 1,
      title: 'Principal',
      objective: screen.objective,
      instruction: screen.designInstruction ?? '',
      criteria: screen.criteria,
      approved: screen.approved,
      targetVersion: screen.targetVersion,
      trigger: 'initial',
      transition: '',
      durationMs: 0,
      currentImageUrl: screen.currentImageUrl,
      currentImagePath: screen.currentImagePath,
      currentWidth: screen.currentWidth,
      currentHeight: screen.currentHeight,
      currentCaptureState: screen.currentCaptureState,
      targetImageUrl: screen.targetImageUrl,
      targetImagePath: screen.targetImagePath,
      targetWidth: screen.targetWidth,
      targetHeight: screen.targetHeight,
      targetSource: screen.targetSource,
    };
  }
  return screen.frames?.find((frame) => frame.id === frameId) ?? frameFor(screen, PRIMARY_FRAME_ID);
}

function updateFrame(
  screen: VisualScreen,
  frameId: string,
  update: (frame: VisualFrame) => VisualFrame,
): VisualScreen {
  const normalized = normalizeFrameId(frameId);
  if (normalized === PRIMARY_FRAME_ID) {
    const frame = update(frameFor(screen, PRIMARY_FRAME_ID));
    return {
      ...screen,
      objective: frame.objective,
      designInstruction: frame.instruction ?? '',
      criteria: frame.criteria,
      approved: frame.approved,
      targetVersion: frame.targetVersion,
      currentImageUrl: frame.currentImageUrl,
      currentImagePath: frame.currentImagePath,
      currentWidth: frame.currentWidth,
      currentHeight: frame.currentHeight,
      currentCaptureState: frame.currentCaptureState,
      targetImageUrl: frame.targetImageUrl,
      targetImagePath: frame.targetImagePath,
      targetWidth: frame.targetWidth,
      targetHeight: frame.targetHeight,
      targetSource: frame.targetSource,
    };
  }
  return {
    ...screen,
    frames: (screen.frames ?? []).map((frame) => (frame.id === normalized ? update(frame) : frame)),
  };
}

function screenForFrame(screen: VisualScreen, frame: VisualFrame): VisualScreen {
  return {
    ...screen,
    objective: frame.objective,
    criteria: frame.criteria,
    approved: frame.approved,
    targetVersion: frame.targetVersion,
    currentImageUrl: frame.currentImageUrl,
    currentImagePath: frame.currentImagePath,
    currentWidth: frame.currentWidth,
    currentHeight: frame.currentHeight,
    currentCaptureState: frame.currentCaptureState,
    targetImageUrl: frame.targetImageUrl,
    targetImagePath: frame.targetImagePath,
    targetWidth: frame.targetWidth,
    targetHeight: frame.targetHeight,
    targetSource: frame.targetSource,
  };
}

function isScreenReady(screen: VisualScreen) {
  const frames = framesFor(screen);
  return frames.length > 0 && frames.every((frame) => frame.approved && frame.targetImagePath);
}

function normalizeFrameId(frameId?: string) {
  return !frameId || frameId === 'default' ? PRIMARY_FRAME_ID : frameId;
}

function designJobKey(screenId: string, frameId: string) {
  return `${screenId}:${normalizeFrameId(frameId)}`;
}

function restoreDraftScreen(screen: VisualScreen): VisualScreen {
  const legacy = screen as VisualScreen & {
    imageUrl?: string;
    imagePath?: string;
    captureWidth?: number;
    captureHeight?: number;
    captureState?: string;
  };
  const {
    imageUrl: _legacyImageUrl,
    imagePath: _legacyImagePath,
    captureWidth: _legacyWidth,
    captureHeight: _legacyHeight,
    captureState: _legacyState,
    currentImageUrl: _currentImageUrl,
    currentImagePath: _currentImagePath,
    targetImageUrl: _targetImageUrl,
    targetImagePath: _targetImagePath,
    ...draft
  } = legacy;
  return {
    ...draft,
    app: draft.app ?? (draft.kind === 'admin-list' || draft.kind === 'admin-detail' ? 'admin-web' : 'public-web'),
    frames: draft.frames?.map(stripFrameTransient),
  };
}

function stripTransientImages(screen: VisualScreen): VisualScreen {
  const {
    currentImageUrl: _currentImageUrl,
    currentImagePath: _currentImagePath,
    currentWidth: _currentWidth,
    currentHeight: _currentHeight,
    currentCaptureState: _currentState,
    targetImageUrl: _targetImageUrl,
    targetImagePath: _targetImagePath,
    targetWidth: _targetWidth,
    targetHeight: _targetHeight,
    targetSource: _targetSource,
    ...draft
  } = screen;
  return {
    ...draft,
    frames: draft.frames?.map(stripFrameTransient),
  };
}

function stripFrameTransient(frame: VisualFrame): VisualFrame {
  const {
    currentImageUrl: _currentImageUrl,
    currentImagePath: _currentImagePath,
    currentWidth: _currentWidth,
    currentHeight: _currentHeight,
    currentCaptureState: _currentCaptureState,
    targetImageUrl: _targetImageUrl,
    targetImagePath: _targetImagePath,
    targetWidth: _targetWidth,
    targetHeight: _targetHeight,
    targetSource: _targetSource,
    ...draft
  } = frame;
  return draft;
}

function isDesignActive(status: DesignJob['status']) {
  return status === 'queued' || status === 'running';
}

function reflowScreens(screens: VisualScreen[]): VisualScreen[] {
  const columns = [35, 315, 595, 875];
  const columnHeights = [38, 38, 38, 38];
  return [...screens]
    .sort((a, b) => a.order - b.order)
    .map((screen) => {
      const column = columnHeights.indexOf(Math.min(...columnHeights));
      const positioned = {
        ...screen,
        x: columns[column]!,
        y: columnHeights[column]!,
      };
      columnHeights[column] = (columnHeights[column] ?? 38) + screen.height + 82;
      return positioned;
    });
}

function visualKindFor(section: DiscoveredSection): ScreenKind {
  const searchable = `${section.id} ${section.title} ${section.route}`.toLowerCase();
  if (section.app === 'admin-web') {
    return /:id|detalle|producto/.test(searchable) ? 'admin-detail' : 'admin-list';
  }
  if (/contact/.test(searchable)) return 'contact';
  if (/cotiz|quote|solicitud/.test(searchable) || section.kind === 'flow') return 'quote';
  if (/:slug|detalle|detail/.test(searchable)) return 'detail';
  if (section.route === '/' || /catalog|inicio|home/.test(searchable)) return 'catalog';
  return 'category';
}

function workspaceForScreen(screen: VisualScreen): VisualWorkspace {
  if (screen.app === 'admin-web' || screen.kind === 'admin-list' || screen.kind === 'admin-detail') {
    return 'admin';
  }
  return 'public';
}

function batchStatusLabel(status: AgentBatch['status']) {
  const labels: Record<AgentBatch['status'], string> = {
    preparing: 'Preparando',
    running: 'Trabajando',
    succeeded: 'Completado',
    partial: 'Parcial',
    failed: 'Fallido',
    blocked: 'Bloqueado',
    cancelled: 'Cancelado',
    interrupted: 'Interrumpido',
  };
  return labels[status];
}

function projectIdFor(projectName: string) {
  const slug = projectSlug(projectName);
  if (slug.includes('shyno')) return 'shynolaser.mx';
  if (slug.includes('aurex')) return 'aurexmg.mx';
  return slug;
}

function buildScreens(projectName: string): VisualScreen[] {
  const shyno = projectName.toLowerCase().includes('shyno');
  const generic = (title: string) => (shyno ? title : title.replace('cotización', 'conversión'));
  return [
    {
      id: 'catalog', order: 1, title: generic('Catálogo'), route: '/', kind: 'catalog',
      x: 35, y: 38, width: 225, height: 570,
      objective: 'Presentar los servicios, materiales y accesos principales con una jerarquía clara.',
      criteria: ['Expone las categorías principales', 'Cada servicio abre su detalle', 'Mantiene visible la cotización', 'Funciona en móvil'],
      variation: 0, approved: false, targetVersion: 0, app: 'public-web',
    },
    {
      id: 'atelier', order: 2, title: generic('Atelier vestible'), route: '/atelier-vestible', kind: 'category',
      x: 320, y: 38, width: 210, height: 315,
      objective: 'Organizar las piezas vestibles como una colección especializada y fácil de explorar.',
      criteria: ['Diferencia las categorías vestibles', 'Prioriza fotografía de producto', 'Conserva filtros útiles', 'Funciona en móvil'],
      variation: 1, approved: false, targetVersion: 0, app: 'public-web',
    },
    {
      id: 'grabables', order: 3, title: generic('Objetos grabables'), route: '/objetos-grabables', kind: 'category',
      x: 585, y: 38, width: 210, height: 315,
      objective: 'Mostrar objetos personalizables sin mezclar esta colección con los servicios industriales.',
      criteria: ['Explica qué puede personalizarse', 'Agrupa productos por uso', 'Muestra precios orientativos', 'Conduce al detalle'],
      variation: 2, approved: false, targetVersion: 0, app: 'public-web',
    },
    {
      id: 'detail', order: 4, title: generic('Detalle de servicio'), route: '/p/:slug', kind: 'detail',
      x: 855, y: 38, width: 225, height: 490,
      objective: 'Explicar el servicio con suficiente contexto y conducir de forma inequívoca a cotización.',
      criteria: ['Expone capacidades y materiales', 'Incluye ejemplos reales', 'Aclara tiempos y condiciones', 'Ofrece una acción siguiente'],
      variation: 0, approved: false, targetVersion: 0, app: 'public-web',
    },
    {
      id: 'quote', order: 5, title: generic('Inicio de cotización'), route: '/cotizar', kind: 'quote',
      x: 468, y: 430, width: 230, height: 300,
      objective: 'Simplificar la solicitud y conservar el contexto del servicio elegido.',
      criteria: ['Solo solicita información necesaria', 'Conserva la selección anterior', 'Explica el siguiente paso', 'Funciona en móvil'],
      variation: 1, approved: false, targetVersion: 0, app: 'public-web',
    },
    {
      id: 'contact', order: 6, title: generic('Contacto'), route: '/contacto', kind: 'contact',
      x: 35, y: 685, width: 225, height: 190,
      objective: 'Ofrecer contacto directo sin competir con el flujo principal de cotización.',
      criteria: ['Muestra canales de contacto', 'Incluye horario y ubicación', 'El formulario es breve', 'Funciona en móvil'],
      variation: 0, approved: false, targetVersion: 0, app: 'public-web',
    },
    {
      id: 'admin-catalog', order: 7, title: generic('Admin · Catálogo'), route: '/catalog', kind: 'admin-list',
      x: 325, y: 795, width: 285, height: 175,
      objective: 'Permitir revisar, filtrar y administrar el catálogo desde una sola superficie operativa.',
      criteria: ['La lista prioriza estado y categoría', 'Permite localizar productos', 'Las acciones son inequívocas', 'Funciona con teclado'],
      variation: 0, approved: false, targetVersion: 0, app: 'admin-web',
    },
    {
      id: 'admin-product', order: 8, title: generic('Admin · Producto'), route: '/catalog/:id', kind: 'admin-detail',
      x: 740, y: 700, width: 320, height: 255,
      objective: 'Editar información, imágenes y publicación de un producto sin perder contexto.',
      criteria: ['Agrupa los campos por intención', 'Distingue guardado de publicación', 'Permite revisar imágenes', 'Evita cambios accidentales'],
      variation: 1, approved: false, targetVersion: 0, app: 'admin-web',
    },
  ];
}

function projectSlug(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type IconName =
  | 'arrow-right' | 'camera' | 'check' | 'chevron-right' | 'copy' | 'edit' | 'expand'
  | 'folder' | 'home' | 'layers' | 'plus' | 'pulse' | 'refresh' | 'settings' | 'star' | 'users';

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    'arrow-right': <path d="M5 12h14m-5-5 5 5-5 5" />,
    camera: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="m8 6 1.5-2h5L16 6" /><circle cx="12" cy="12.5" r="3.2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />,
    expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />,
    folder: <path d="M3 6h6l2 2h10v10H3Z" />,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    pulse: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    refresh: <><path d="M20 11a8 8 0 0 0-14-5l-2 2" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2M20 20v-4h-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6.2L14.7 4h-4L10.4 6.2A7 7 0 0 0 8.8 7L6.5 6.1l-2 3.4L6.6 11a7 7 0 0 0 0 2l-2.1 1.5 2 3.4 2.3-1a7 7 0 0 0 1.6.9l.3 2.2h4l.3-2.2a7 7 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
    users: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0M14 16a5 5 0 0 1 7 4" /></>,
  };
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
