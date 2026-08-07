import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  LmwaresProject,
  LmwaresProjectHealth,
  LmwaresProjectPhase,
  LmwaresProjectPriority,
  LmwaresProjectSnapshot,
} from '@starter/domain';
import { syncLmwaresProjectsSchema, type SyncLmwaresProjectsInput } from '@starter/validation';
import { ProjectControlPanel } from '../components/projects/ProjectControlPanel';
import { api } from '../lib/api';
import { isClientStarterProject } from '../lib/project-classification';

type DetailTab = 'summary' | 'phases' | 'snapshots' | 'control' | 'registry';
type RegistryMode = 'loading' | 'registry' | 'local-scan' | 'empty' | 'error';

interface ScanMeta {
  generatedAt: string | null;
  root: string;
  source: string;
}

const PRIORITY_SCORE: Record<LmwaresProjectPriority, number> = {
  Alta: 0,
  Media: 1,
  Normal: 2,
};

export function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('projectId')?.trim() || null;
  const [projects, setProjects] = useState<LmwaresProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('summary');
  const [registryMode, setRegistryMode] = useState<RegistryMode>('loading');
  const [localScan, setLocalScan] = useState<SyncLmwaresProjectsInput | null>(null);
  const [scanMeta, setScanMeta] = useState<ScanMeta>({
    generatedAt: null,
    root: 'C:\\dev',
    source: 'cargando',
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [snapshots, setSnapshots] = useState<LmwaresProjectSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const scanFileRef = useRef<HTMLInputElement>(null);
  const [showScanPaste, setShowScanPaste] = useState(false);
  const [scanJson, setScanJson] = useState('');

  const orderedProjects = useMemo(() => sortProjects(projects), [projects]);
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? orderedProjects[0] ?? null;
  const selectedPhase = selectedProject ? getCurrentPhase(selectedProject) : null;
  const actionableCount = projects.filter((project) => project.health !== 'on-track').length;
  const clientProjectCount = projects.filter((project) => isClientStarterProject(project)).length;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [registryResult, scanResult] = await Promise.allSettled([
        api.listLmwaresProjects(),
        loadLocalScan(),
      ]);
      if (cancelled) return;

      const scan = scanResult.status === 'fulfilled' ? scanResult.value : null;
      setLocalScan(scan);

      if (registryResult.status === 'fulfilled' && registryResult.value.projects.length > 0) {
        const registry = registryResult.value;
        setProjects(registry.projects);
        setRegistryMode('registry');
        setScanMeta({
          generatedAt: registry.syncedAt,
          root: readRegistryRoot(registry.projects) ?? scan?.root ?? 'C:\\dev',
          source: registry.source,
        });
        return;
      }

      if (scan) {
        setProjects(scan.projects.map((project) => projectFromScan(project, scan)));
        setRegistryMode('local-scan');
        setScanMeta({ generatedAt: scan.generatedAt, root: scan.root, source: 'local-scan' });
        setFeedback(
          registryResult.status === 'rejected'
            ? 'El API privado no está disponible; se muestra el escaneo local sin persistir.'
            : 'El registro D1 está vacío. Sincroniza este escaneo para convertirlo en estado canónico.',
        );
        return;
      }

      if (registryResult.status === 'fulfilled') {
        setRegistryMode('empty');
        setScanMeta({ generatedAt: null, root: 'C:\\dev', source: 'd1-registry' });
        return;
      }

      setRegistryMode('error');
      setFeedback('No fue posible leer el registro privado ni el escaneo local.');
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const firstProject = orderedProjects[0];
    if (!firstProject) {
      setSelectedProjectId(null);
      return;
    }

    setSelectedProjectId((current) =>
      requestedProjectId && orderedProjects.some((project) => project.id === requestedProjectId)
        ? requestedProjectId
        : current && orderedProjects.some((project) => project.id === current)
        ? current
        : firstProject.id,
    );
  }, [orderedProjects, requestedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      if (!searchParams.get('projectId')) return;
      const next = new URLSearchParams(searchParams);
      next.delete('projectId');
      setSearchParams(next, { replace: true });
      return;
    }
    const currentProjectId = searchParams.get('projectId')?.trim() || null;
    if (currentProjectId === selectedProjectId) return;
    const next = new URLSearchParams(searchParams);
    next.set('projectId', selectedProjectId);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedProjectId, setSearchParams]);

  useEffect(() => {
    if (!selectedProjectId || registryMode !== 'registry') {
      setSnapshots([]);
      return;
    }

    let cancelled = false;
    setSnapshotsLoading(true);
    api
      .listLmwaresProjectSnapshots(selectedProjectId)
      .then((items) => {
        if (!cancelled) setSnapshots(items);
      })
      .catch(() => {
        if (!cancelled) setSnapshots([]);
      })
      .finally(() => {
        if (!cancelled) setSnapshotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [registryMode, selectedProjectId]);

  async function syncLocalScan() {
    if (!localScan) return;
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await api.syncLmwaresProjects(localScan);
      setProjects(result.projects);
      setRegistryMode('registry');
      setScanMeta({
        generatedAt: result.syncedAt,
        root: localScan.root,
        source: result.source,
      });
      setFeedback(`${result.upserted ?? localScan.projects.length} proyectos sincronizados en D1.`);
    } catch (error) {
      setFeedback(errorMessage(error, 'No se pudo sincronizar el escaneo.'));
    } finally {
      setSyncing(false);
    }
  }

  async function importScanFile(file: File | null) {
    if (!file) return;
    try {
      importScanText(await file.text());
    } catch (error) {
      setFeedback(errorMessage(error, 'No se pudo leer el archivo de escaneo.'));
    } finally {
      if (scanFileRef.current) scanFileRef.current.value = '';
    }
  }

  function importScanText(text: string) {
    setFeedback(null);
    try {
      const raw = JSON.parse(text) as unknown;
      const result = syncLmwaresProjectsSchema.safeParse(raw);
      if (!result.success) {
        throw new Error('El contenido no cumple el contrato del escaneo LMWARES.');
      }
      const scan = result.data;
      setLocalScan(scan);
      setProjects(scan.projects.map((project) => projectFromScan(project, scan)));
      setRegistryMode('local-scan');
      setDetailTab('registry');
      setScanMeta({ generatedAt: scan.generatedAt, root: scan.root, source: scan.source });
      setFeedback(
        `${scan.projects.length} proyectos listos para revisar y sincronizar con D1.`,
      );
      setShowScanPaste(false);
      setScanJson('');
    } catch (error) {
      setFeedback(errorMessage(error, 'No se pudo importar el escaneo.'));
    }
  }

  async function saveCurrentSnapshot() {
    if (!selectedProject || registryMode !== 'registry') return;
    setSnapshotSaving(true);
    setFeedback(null);
    try {
      const sourceRevision =
        readNestedString(selectedProject.scanMetadata, 'git', 'commitSha') ??
        selectedProject.branch;
      const created = await api.createLmwaresProjectSnapshot(selectedProject.id, {
        kind: 'manual',
        label: `Estado ${new Date().toLocaleString('es-MX')}`,
        summary: selectedProject.nextAction,
        sourceRevision,
        previewUrl: selectedProject.previewUrl || null,
        artifactPath: selectedProject.repo,
        metadata: {
          phase: selectedProject.phase,
          progress: selectedProject.progress,
          health: selectedProject.health,
        },
      });
      setSnapshots((current) => [created, ...current]);
      setFeedback('Snapshot registrado como evidencia privada.');
    } catch (error) {
      setFeedback(errorMessage(error, 'No se pudo registrar el snapshot.'));
    } finally {
      setSnapshotSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f3f5f2] text-[#121a16]">
      <div className="flex flex-none items-center justify-between gap-4 border-b border-black/10 bg-white px-4 py-3 lg:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
            LMWARES Oracle
          </p>
          <h1 className="text-lg font-black">Registro privado de proyectos</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={scanFileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Importar escaneo LMWARES"
            onChange={(event) => void importScanFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => scanFileRef.current?.click()}
            className="rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-black text-[#26332b] transition hover:bg-[#eef2ec]"
          >
            Importar escaneo JSON
          </button>
          <button
            type="button"
            onClick={() => setShowScanPaste((current) => !current)}
            className="rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-black text-[#26332b] transition hover:bg-[#eef2ec]"
          >
            Pegar JSON
          </button>
          <RegistryBadge mode={registryMode} />
        </div>
      </div>

      {showScanPaste ? (
        <section className="flex flex-none flex-col gap-3 border-b border-black/10 bg-[#eef2ec] px-4 py-3 sm:flex-row sm:items-end lg:px-6">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.1em] text-[#526158]">
              Contenido de dev-projects.json
            </span>
            <textarea
              value={scanJson}
              onChange={(event) => setScanJson(event.target.value)}
              rows={4}
              spellCheck={false}
              className="w-full resize-y rounded-md border border-black/15 bg-white p-2 font-mono text-xs"
              placeholder='{"schemaVersion":1,"generatedAt":"…","projects":[…]}'
            />
          </label>
          <div className="flex gap-2 sm:flex-col">
            <button
              type="button"
              disabled={!scanJson.trim()}
              onClick={() => importScanText(scanJson)}
              className="flex-1 rounded-md bg-[#0f6f50] px-4 py-2 text-xs font-black text-white disabled:opacity-45"
            >
              Validar escaneo
            </button>
            <button
              type="button"
              onClick={() => {
                setShowScanPaste(false);
                setScanJson('');
              }}
              className="flex-1 rounded-md border border-black/15 bg-white px-4 py-2 text-xs font-black"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      <main className="mx-auto grid min-h-0 w-full max-w-7xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_410px] lg:px-6">
        <section className="min-h-0 min-w-0 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-none items-center justify-between gap-4 border-b border-black/10 px-4 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
                  Proyectos / templates
                </p>
                <h2 className="text-lg font-black">Prioridad operativa</h2>
              </div>
              <span className="rounded-full bg-[#eef5ec] px-3 py-1 text-xs font-black text-[#26614b]">
                {orderedProjects.length} registrados
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {registryMode === 'loading' ? (
                <EmptyState
                  title="Leyendo registro privado"
                  detail="Consultando D1 y el escaneo local…"
                />
              ) : orderedProjects.length === 0 ? (
                <EmptyState
                  title="Aún no hay proyectos registrados"
                  detail="Ejecuta npm run lmwares:scan e importa .lmwares/cache/dev-projects.json para revisarlo y sincronizarlo con D1."
                />
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {orderedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      active={selectedProject?.id === project.id}
                      onSelect={() => setSelectedProjectId(project.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="min-h-0 min-w-0 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
          {selectedProject && selectedPhase ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-none items-start justify-between gap-3 border-b border-black/10 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
                    Proyecto seleccionado
                  </p>
                  <h2 className="mt-1 truncate text-xl font-black">{selectedProject.name}</h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <ProjectOriginBadge project={selectedProject} />
                    <HealthBadge health={selectedProject.health} />
                  </div>
                  <div className="flex gap-2">
                    {isClientStarterProject(selectedProject) ? (
                      <Link
                        to={`/projects/${encodeURIComponent(selectedProject.id)}/modules/blog`}
                        className="rounded-md border border-[#24598c] bg-[#eaf4ff] px-3 py-2 text-xs font-black text-[#123f69] transition hover:bg-[#d8ebff]"
                      >
                        Abrir módulos
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Este registro es un proyecto interno de Oracle: los módulos de contenido (blog, galerías, docs, formularios, eventos) solo aplican a sitios Starter de clientes."
                        className="cursor-not-allowed rounded-md border border-black/10 bg-[#f1f3f0] px-3 py-2 text-xs font-black text-[#8a938d]"
                      >
                        Módulos no aplican
                      </button>
                    )}
                    <Link
                      to={`/projects/prepare?project=${encodeURIComponent(selectedProject.id)}&name=${encodeURIComponent(selectedProject.name)}`}
                      className="rounded-md bg-[#17201b] px-3 py-2 text-xs font-black text-white transition hover:bg-[#28332c]"
                    >
                      Preparar trabajo
                    </Link>
                  </div>
                </div>
              </div>

              <div className="flex flex-none gap-2 overflow-x-auto border-b border-black/10 px-3 py-2">
                <TabButton active={detailTab === 'summary'} onClick={() => setDetailTab('summary')}>
                  Resumen
                </TabButton>
                <TabButton active={detailTab === 'phases'} onClick={() => setDetailTab('phases')}>
                  Fases
                </TabButton>
                <TabButton
                  active={detailTab === 'snapshots'}
                  onClick={() => setDetailTab('snapshots')}
                >
                  Snapshots
                </TabButton>
                <TabButton active={detailTab === 'control'} onClick={() => setDetailTab('control')}>
                  Control
                </TabButton>
                <TabButton
                  active={detailTab === 'registry'}
                  onClick={() => setDetailTab('registry')}
                >
                  Registro
                </TabButton>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {detailTab === 'summary' ? (
                  <SummaryPanel project={selectedProject} />
                ) : detailTab === 'phases' ? (
                  <PhasesPanel project={selectedProject} activePhase={selectedPhase} />
                ) : detailTab === 'snapshots' ? (
                  <SnapshotsPanel
                    snapshots={snapshots}
                    loading={snapshotsLoading}
                    enabled={registryMode === 'registry'}
                    saving={snapshotSaving}
                    onSave={() => void saveCurrentSnapshot()}
                  />
                ) : detailTab === 'control' ? (
                  <ProjectControlPanel
                    project={selectedProject}
                    snapshots={snapshots}
                    enabled={registryMode === 'registry'}
                  />
                ) : (
                  <RegistryPanel
                    mode={registryMode}
                    meta={scanMeta}
                    projectCount={projects.length}
                    clientProjectCount={clientProjectCount}
                    actionableCount={actionableCount}
                    canSync={Boolean(localScan)}
                    syncing={syncing}
                    feedback={feedback}
                    onSync={() => void syncLocalScan()}
                  />
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Registro sin selección"
              detail="Cuando exista un proyecto aparecerán aquí su repo, fases y snapshots."
            />
          )}
        </aside>
      </main>
    </div>
  );
}

async function loadLocalScan(): Promise<SyncLmwaresProjectsInput | null> {
  if (!import.meta.env.DEV) return null;
  const response = await fetch(`/__lmwares/local-scan?t=${Date.now()}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`No se pudo leer el escaneo local (${response.status}).`);
  const result = syncLmwaresProjectsSchema.safeParse(await response.json());
  if (!result.success) throw new Error('El escaneo local no cumple el contrato LMWARES.');
  return result.data;
}

function projectFromScan(
  project: SyncLmwaresProjectsInput['projects'][number],
  scan: SyncLmwaresProjectsInput,
): LmwaresProject {
  return {
    id: project.id,
    name: project.name,
    business: project.business,
    category: project.category,
    statusLabel: project.statusLabel,
    phase: project.phase,
    progress: project.progress,
    priority: project.priority,
    health: project.health,
    repo: project.repo,
    branch: project.branch,
    previewUrl: project.previewUrl,
    lastRefresh: project.lastRefresh,
    developer: project.developer,
    due: project.due,
    day: project.day,
    daysLeft: project.daysLeft,
    nextAction: project.nextAction,
    seedPrompt: project.seedPrompt,
    tags: project.tags,
    preview: project.preview,
    phases: project.phases,
    registrySource: `${scan.source}:${project.lmwares.source}`,
    manifestPath: project.lmwares.manifestPath,
    scanMetadata: {
      root: scan.root,
      signals: project.lmwares.signals,
      git: project.lmwares.git,
    },
    firstSeenAt: scan.generatedAt,
    lastScannedAt: scan.generatedAt,
    createdAt: scan.generatedAt,
    updatedAt: scan.generatedAt,
  };
}

function sortProjects(projects: LmwaresProject[]) {
  return [...projects].sort((left, right) => {
    const priorityDelta = PRIORITY_SCORE[left.priority] - PRIORITY_SCORE[right.priority];
    if (priorityDelta !== 0) return priorityDelta;
    const daysDelta = left.daysLeft - right.daysLeft;
    if (daysDelta !== 0) return daysDelta;
    return right.progress - left.progress;
  });
}

function getCurrentPhase(project: LmwaresProject): LmwaresProjectPhase {
  return (
    project.phases.find((phase) => phase.status === 'active') ??
    project.phases.find((phase) => phase.status === 'review') ??
    project.phases.find((phase) => phase.status === 'blocked') ??
    project.phases.find((phase) => phase.status === 'locked') ??
    project.phases.at(-1)!
  );
}

function SummaryPanel({ project }: { project: LmwaresProject }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <InfoRow label="Repo" value={project.repo} mono />
        <InfoRow label="Branch" value={project.branch} mono />
        <InfoRow label="Preview" value={project.previewUrl || 'Sin preview registrado'} mono />
        <InfoRow label="Actualización" value={project.lastRefresh} />
        <InfoRow label="Entrega" value={project.due} />
        <InfoRow label="Responsable" value={project.developer} />
        <InfoRow label="Origen" value={project.registrySource} />
      </div>
      <div className="rounded-lg border border-black/10 bg-[#101813] p-3 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
          Siguiente acción
        </p>
        <p className="mt-2 text-xs leading-5 text-[#e8f2ed]">{project.nextAction}</p>
      </div>
      <div className="rounded-lg border border-black/10 bg-[#f8faf6] p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#66736a]">
          Semilla operativa
        </p>
        <p className="mt-2 text-xs leading-5 text-[#4d5d54]">{project.seedPrompt}</p>
      </div>
    </div>
  );
}

function PhasesPanel({
  project,
  activePhase,
}: {
  project: LmwaresProject;
  activePhase: LmwaresProjectPhase;
}) {
  const completed = project.phases.filter((phase) => phase.status === 'completed').length;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#d8ded7] bg-[#f8faf6] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#66736a]">
              Evidencia por fases
            </p>
            <h3 className="mt-1 text-base font-black">
              {completed}/{project.phases.length} completadas
            </h3>
          </div>
          <span className="rounded-full bg-[#eef5ec] px-3 py-1 text-xs font-black text-[#26614b]">
            {project.progress}%
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[#dfe6df]">
          <div
            className="h-2 rounded-full bg-[#0f7c55]"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>
      <div className="grid gap-2">
        {project.phases.map((phase) => (
          <PhaseRow key={phase.id} phase={phase} active={phase.id === activePhase.id} />
        ))}
      </div>
    </div>
  );
}

function SnapshotsPanel({
  snapshots,
  loading,
  enabled,
  saving,
  onSave,
}: {
  snapshots: LmwaresProjectSnapshot[];
  loading: boolean;
  enabled: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-black/10 bg-[#f8faf6] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
          Evidencia interactuable
        </p>
        <p className="mt-1 text-xs leading-5 text-[#4d5d54]">
          Cada snapshot fija revisión, preview y estado del proyecto sin ejecutar comandos ni
          desplegar.
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={!enabled || saving}
          className="mt-3 w-full rounded-md bg-[#17201b] px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving
            ? 'Registrando…'
            : enabled
              ? 'Guardar snapshot actual'
              : 'Sincroniza primero con D1'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#66736a]">Leyendo snapshots…</p>
      ) : snapshots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/15 p-4 text-sm text-[#66736a]">
          Todavía no hay snapshots para este proyecto.
        </p>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snapshot) => (
            <article key={snapshot.id} className="rounded-lg border border-black/10 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{snapshot.label}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-[#66736a]">
                    {snapshot.kind} · {new Date(snapshot.createdAt).toLocaleString('es-MX')}
                  </p>
                </div>
                <span className="rounded-full bg-[#eef2ec] px-2 py-1 text-[10px] font-black">
                  {snapshot.createdBy}
                </span>
              </div>
              {snapshot.summary ? (
                <p className="mt-2 text-xs leading-5 text-[#4d5d54]">{snapshot.summary}</p>
              ) : null}
              {snapshot.sourceRevision ? (
                <p className="mt-2 truncate font-mono text-[11px] text-[#66736a]">
                  {snapshot.sourceRevision}
                </p>
              ) : null}
              {snapshot.previewUrl ? (
                <a
                  href={snapshot.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-black text-[#0f6f50] underline"
                >
                  Abrir preview
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RegistryPanel({
  mode,
  meta,
  projectCount,
  clientProjectCount,
  actionableCount,
  canSync,
  syncing,
  feedback,
  onSync,
}: {
  mode: RegistryMode;
  meta: ScanMeta;
  projectCount: number;
  clientProjectCount: number;
  actionableCount: number;
  canSync: boolean;
  syncing: boolean;
  feedback: string | null;
  onSync: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-black/10 bg-[#f8faf6] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
          Estado canónico
        </p>
        <h3 className="mt-1 text-xl font-black">
          {mode === 'registry' ? 'D1 privado' : 'Escaneo local'}
        </h3>
        <p className="mt-1 text-xs leading-5 text-[#4d5d54]">
          El escáner solo descubre repos. D1 conserva el registro y los snapshots del operador.
        </p>
      </div>
      <div className="grid gap-2">
        <InfoRow label="Fuente" value={meta.source} />
        <InfoRow label="Raíz" value={meta.root} mono />
        <InfoRow
          label="Último scan"
          value={meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('es-MX') : 'Sin scan'}
        />
        <MetricTile label="Registrados" value={String(projectCount)} detail="proyectos" />
        <MetricTile label="Clientes" value={String(clientProjectCount)} detail="sitios Starter" />
        <MetricTile label="Atención" value={String(actionableCount)} detail="requieren acción" />
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={!canSync || syncing}
        className="w-full rounded-md bg-[#0f6f50] px-3 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        {syncing ? 'Sincronizando…' : 'Sincronizar escaneo con D1'}
      </button>
      {feedback ? (
        <p className="rounded-lg border border-black/10 bg-white p-3 text-xs leading-5 text-[#4d5d54]">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function ProjectCard({
  project,
  active,
  onSelect,
}: {
  project: LmwaresProject;
  active: boolean;
  onSelect: () => void;
}) {
  const phase = getCurrentPhase(project);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'group overflow-hidden rounded-lg border bg-white text-left shadow-sm transition',
        active
          ? 'border-[#17201b] ring-2 ring-[#17201b]/10'
          : 'border-black/10 hover:border-[#829087]',
      ].join(' ')}
    >
      <MiniSitePreview project={project} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
              {project.category}
            </p>
            <h2 className="mt-1 truncate text-xl font-black">{project.name}</h2>
            <p className="mt-1 text-sm text-[#66736a]">{project.business}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PriorityBadge priority={project.priority} />
            <ProjectOriginBadge project={project} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#eef2ec] px-2.5 py-1 text-xs font-semibold text-[#526158]"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-black">{project.phase}</span>
            <span className="font-black text-[#0f7c55]">{project.progress}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#e3e8e1]">
            <div
              className="h-2 rounded-full bg-[#0f7c55]"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-2 border-t border-black/10 pt-4 text-xs text-[#5b6860] sm:grid-cols-2">
          <span>
            <strong className="block text-[#17201b]">Estado</strong>
            {project.statusLabel}
          </span>
          <span>
            <strong className="block text-[#17201b]">Fase actual</strong>
            {phase.owner}
          </span>
          <span>
            <strong className="block text-[#17201b]">Entrega</strong>
            {project.due}
          </span>
          <span>
            <strong className="block text-[#17201b]">Repo</strong>
            <span className="line-clamp-1 font-mono">{project.repo}</span>
          </span>
        </div>
      </div>
    </button>
  );
}

function MiniSitePreview({ project }: { project: LmwaresProject }) {
  return (
    <div
      className="relative h-[170px] overflow-hidden border-b border-black/10 bg-[#e9eeea]"
      style={{ backgroundColor: `${project.preview.palette}18` }}
    >
      <div className="absolute inset-4 rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="flex h-8 items-center gap-1.5 border-b border-black/10 px-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e45d50]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f3bc48]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#47a66a]" />
          <span className="ml-2 h-3 flex-1 rounded-full bg-[#edf1ee]" />
        </div>
        <div className="grid h-[calc(100%-2rem)] grid-cols-[1.1fr_0.9fr] gap-3 p-4">
          <div className="flex min-w-0 flex-col justify-between">
            <div className="space-y-2">
              <div
                className="h-2.5 w-20 rounded-full"
                style={{ backgroundColor: project.preview.palette }}
              />
              <div className="h-4 w-full rounded bg-[#17201b]" />
              <div className="h-4 w-4/5 rounded bg-[#17201b]" />
              <div className="h-2.5 w-3/4 rounded bg-[#b8c4bd]" />
            </div>
            <div
              className="h-7 w-24 rounded"
              style={{ backgroundColor: project.preview.palette }}
            />
          </div>
          <div className="grid gap-2">
            <div className="rounded-lg" style={{ backgroundColor: project.preview.palette }} />
            <div className="grid grid-cols-3 gap-2">
              <span className="rounded-md bg-[#dfe7e2]" />
              <span className="rounded-md bg-[#cbd8d0]" />
              <span className="rounded-md bg-[#edf1ee]" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-3 flex items-center justify-between rounded-lg border border-white/60 bg-white/90 px-3 py-2 text-xs font-black shadow-sm backdrop-blur">
        <span className="truncate">{project.preview.title}</span>
        <span
          className="ml-3 rounded-full px-2 py-1 text-white"
          style={{ backgroundColor: project.preview.palette }}
        >
          Snapshot
        </span>
      </div>
    </div>
  );
}

function PhaseRow({ phase, active }: { phase: LmwaresProjectPhase; active: boolean }) {
  const statusClass =
    phase.status === 'completed'
      ? 'bg-[#0f7c55]'
      : phase.status === 'active'
        ? 'bg-[#2563eb]'
        : phase.status === 'review'
          ? 'bg-[#d97706]'
          : phase.status === 'blocked'
            ? 'bg-[#b91c1c]'
            : 'bg-[#b8c2ba]';
  return (
    <div
      className={`rounded-lg border p-3 ${active ? 'border-[#0f7c55] bg-[#ecfff7]' : 'border-black/10 bg-white'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black">{phase.label}</p>
          <p className="mt-1 text-xs leading-5 text-[#66736a]">{phase.evidence}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#526158]">
            {phase.owner}
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black text-white ${statusClass}`}>
          {phaseStatusLabel(phase.status)}
        </span>
      </div>
    </div>
  );
}

function RegistryBadge({ mode }: { mode: RegistryMode }) {
  const labels: Record<RegistryMode, string> = {
    loading: 'Cargando',
    registry: 'D1 privado',
    'local-scan': 'Scan local',
    empty: 'Registro vacío',
    error: 'Sin conexión',
  };
  const className =
    mode === 'registry'
      ? 'bg-[#e5f7ee] text-[#0f6f50]'
      : mode === 'error'
        ? 'bg-[#feecec] text-[#a51d1d]'
        : 'bg-[#fff3cf] text-[#7a5b0b]';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>{labels[mode]}</span>
  );
}

function HealthBadge({ health }: { health: LmwaresProjectHealth }) {
  const label =
    health === 'on-track' ? 'En ruta' : health === 'needs-action' ? 'Requiere acción' : 'En riesgo';
  const className =
    health === 'on-track'
      ? 'bg-[#e5f7ee] text-[#0f6f50]'
      : health === 'needs-action'
        ? 'bg-[#fff3cf] text-[#7a5b0b]'
        : 'bg-[#feecec] text-[#a51d1d]';
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>{label}</span>;
}

function PriorityBadge({ priority }: { priority: LmwaresProjectPriority }) {
  const className =
    priority === 'Alta'
      ? 'bg-[#17201b] text-white'
      : priority === 'Media'
        ? 'bg-[#e8efe9] text-[#33443a]'
        : 'bg-[#f1f3f0] text-[#5c6860]';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>{priority}</span>
  );
}

/**
 * Distinguishes a registry entry that is an actual client Starter site
 * (eligible for `/projects/:id/modules/*` content management) from Oracle's
 * own internal projects, so operators don't confuse the two at a glance.
 */
function ProjectOriginBadge({ project }: { project: LmwaresProject }) {
  const client = isClientStarterProject(project);
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${
        client ? 'bg-[#eaf4ff] text-[#123f69]' : 'bg-[#f1f3f0] text-[#5c6860]'
      }`}
    >
      {client ? 'Cliente Starter' : 'Interno Oracle'}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-black ${
        active ? 'bg-[#17201b] text-white' : 'bg-[#eef2ec] text-[#526158]'
      }`}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 rounded-lg border border-black/10 bg-[#f8faf6] p-2.5 text-xs">
      <span className="font-bold uppercase tracking-[0.08em] text-[#66736a]">{label}</span>
      <span
        className={`min-w-0 break-words font-semibold text-[#26332b] ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-[#f8faf6] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">{label}</p>
      <p className="mt-0.5 text-2xl font-black leading-none">{value}</p>
      <p className="text-sm text-[#647166]">{detail}</p>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-lg font-black">{title}</p>
        <p className="mt-2 text-sm leading-6 text-[#66736a]">{detail}</p>
      </div>
    </div>
  );
}

function phaseStatusLabel(status: LmwaresProjectPhase['status']) {
  if (status === 'completed') return 'Completada';
  if (status === 'active') return 'Activa';
  if (status === 'review') return 'Revisión';
  if (status === 'blocked') return 'Bloqueada';
  return 'Pendiente';
}

function readRegistryRoot(projects: LmwaresProject[]): string | null {
  for (const project of projects) {
    const root = project.scanMetadata['root'];
    if (typeof root === 'string') return root;
  }
  return null;
}

function readNestedString(
  metadata: Record<string, unknown>,
  objectKey: string,
  valueKey: string,
): string | null {
  const nested = metadata[objectKey];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
  const value = (nested as Record<string, unknown>)[valueKey];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
