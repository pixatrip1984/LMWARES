export type AgentOperation = 'discover' | 'implement';
export type AgentRunStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'interrupted';

export interface AgentTaskInput {
  id: string;
  title: string;
  route: string;
  objective: string;
  criteria: string[];
  sourceFiles: string[];
  imagePaths: string[];
  visualFrames?: AgentVisualFrame[];
}

export interface AgentVisualFrame {
  id: string;
  title: string;
  objective: string;
  criteria: string[];
  trigger: 'initial' | 'automatic' | 'interaction' | 'scroll';
  transition: string;
  durationMs: number;
  imagePath: string;
}

export interface DiscoveredSection {
  id: string;
  title: string;
  app: 'public-web' | 'admin-web';
  kind: 'page' | 'flow' | 'admin' | 'state';
  route: string;
  objective: string;
  criteria: string[];
  sourceFiles: string[];
  dependencies: string[];
}

export interface AgentRun {
  runId: string;
  taskId: string;
  title: string;
  route: string;
  status: AgentRunStatus;
  currentActivity: string | null;
  branchName: string | null;
  worktreePath: string | null;
  threadId: string | null;
  summary: string;
  changedFiles: string[];
  changesPresent: boolean | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  sandboxHealthy?: boolean;
  warnings?: string[];
  result: { projectName: string; sections: DiscoveredSection[] } | null;
  stderrTail: string;
}

export interface AgentBatch {
  batchId: string;
  projectId: string;
  projectName: string;
  mode: AgentOperation;
  status:
    | 'preparing'
    | 'running'
    | 'succeeded'
    | 'partial'
    | 'failed'
    | 'blocked'
    | 'cancelled'
    | 'interrupted';
  baseRef: string;
  baseRevision: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  runs: AgentRun[];
}

export interface AgentRunnerProject {
  projectId: string;
  name: string;
  repo: string;
  enabled: boolean;
  reasonCode: string | null;
  reason: string | null;
  baseRef: string | null;
  baseRevision: string | null;
  maxParallel: number;
  operations: AgentOperation[];
  model: string | null;
}

export interface AgentRunnerStatus {
  schemaVersion: 1;
  runnerVersion: string;
  project: AgentRunnerProject;
  batch: AgentBatch | null;
}

export interface ProjectCapture {
  screenId: string;
  frameId: string;
  route: string;
  width: number;
  height: number;
  capturedAt: string;
  imagePath: string;
  imageUrl: string;
}

export interface ProjectCaptureInput {
  screenId: string;
  frameId?: string;
  route: string;
  strategy?: 'sections' | 'viewport';
}

export interface ProjectCaptureManifest {
  schemaVersion: 1;
  projectId: string;
  source: string | null;
  baseUrl: string | null;
  capturedAt: string | null;
  captures: ProjectCapture[];
}

export interface ProjectTarget {
  screenId: string;
  frameId?: string;
  version: number;
  width: number;
  height: number;
  contentType: 'image/png' | 'image/jpeg';
  source: 'imagegen' | 'uploaded';
  createdAt: string;
  promptSha256: string | null;
  threadId: string | null;
  imagePath: string;
  imageUrl: string;
}

export interface ProjectTargetManifest {
  schemaVersion: 1;
  projectId: string;
  updatedAt: string | null;
  targets: ProjectTarget[];
}

export interface DesignGenerationInput {
  screenId: string;
  frameId?: string;
  frameTitle?: string;
  title: string;
  route: string;
  objective: string;
  instruction: string;
  criteria: string[];
  trigger?: AgentVisualFrame['trigger'];
  transition?: string;
  durationMs?: number;
}

export interface ProjectVisualMap<TScreen = unknown> {
  schemaVersion: 1;
  projectId: string;
  updatedAt: string;
  selectedScreenId: string;
  screens: TScreen[];
}

export interface DesignJob {
  jobId: string;
  projectId: string;
  screenId: string;
  frameId?: string;
  title: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled' | 'interrupted';
  currentActivity: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  threadId: string | null;
  target: ProjectTarget | null;
  summary: string;
  warnings: string[];
}

export async function getAgentRunnerStatus(
  projectId: string,
  batchId?: string,
): Promise<AgentRunnerStatus> {
  const query = new URLSearchParams({ projectId });
  if (batchId) query.set('batchId', batchId);
  return agentRequest<AgentRunnerStatus>(`/__lmwares/agents/status?${query}`, {
    cache: 'no-store',
  });
}

export async function getProjectCaptures(projectId: string): Promise<ProjectCaptureManifest> {
  const query = new URLSearchParams({ projectId });
  return agentRequest<ProjectCaptureManifest>(`/__lmwares/agents/captures?${query}`, {
    cache: 'no-store',
  });
}

export async function captureProjectScreen(
  projectId: string,
  input: ProjectCaptureInput,
): Promise<ProjectCapture> {
  return agentRequest<ProjectCapture>('/__lmwares/agents/capture/run', {
    method: 'POST',
    body: JSON.stringify({ projectId, ...input }),
  });
}

export async function getProjectTargets(projectId: string): Promise<ProjectTargetManifest> {
  const query = new URLSearchParams({ projectId });
  return agentRequest<ProjectTargetManifest>(`/__lmwares/agents/targets?${query}`, {
    cache: 'no-store',
  });
}

export async function getProjectVisualMap<TScreen>(
  projectId: string,
): Promise<ProjectVisualMap<TScreen> | null> {
  const query = new URLSearchParams({ projectId });
  const response = await agentRequest<{ map: ProjectVisualMap<TScreen> | null }>(
    `/__lmwares/agents/map?${query}`,
    { cache: 'no-store' },
  );
  return response.map;
}

export async function saveProjectVisualMap<TScreen>(
  projectId: string,
  input: { selectedScreenId: string; screens: TScreen[] },
): Promise<ProjectVisualMap<TScreen>> {
  const response = await agentRequest<{ map: ProjectVisualMap<TScreen> }>(
    '/__lmwares/agents/map',
    {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ projectId, ...input }),
    },
  );
  return response.map;
}

export async function generateDesignTarget(
  projectId: string,
  input: DesignGenerationInput,
): Promise<DesignJob> {
  return agentRequest<DesignJob>('/__lmwares/agents/design/generate', {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ projectId, ...input }),
  });
}

export async function getDesignJob(projectId: string, jobId: string): Promise<DesignJob> {
  const query = new URLSearchParams({ projectId, jobId });
  return agentRequest<DesignJob>(`/__lmwares/agents/design/status?${query}`, {
    cache: 'no-store',
  });
}

export async function uploadDesignTarget(
  projectId: string,
  screenId: string,
  file: File,
  frameId = 'primary',
): Promise<ProjectTarget> {
  const query = new URLSearchParams({ projectId, screenId, frameId });
  return agentRequest<ProjectTarget>(`/__lmwares/agents/target/upload?${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-Lmwares-Agents': '1',
    },
    body: file,
  });
}

export async function launchAgentBatch(
  projectId: string,
  mode: AgentOperation,
  tasks: AgentTaskInput[],
): Promise<AgentBatch> {
  return agentRequest<AgentBatch>('/__lmwares/agents/launch', {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ projectId, mode, tasks }),
  });
}

export async function cancelAgentRun(projectId: string, runId: string) {
  return agentRequest<{ runId: string; status: 'cancelling' }>('/__lmwares/agents/cancel', {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ projectId, runId }),
  });
}

function mutationHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Lmwares-Agents': '1',
  };
}

async function agentRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? `Ejecutor de agentes no disponible (${response.status}).`);
  }
  return payload;
}
