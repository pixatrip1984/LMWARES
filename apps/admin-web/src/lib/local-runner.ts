import type { LmwaresValidationKind, LmwaresValidationStatus } from '@starter/domain';

export interface LocalRunnerValidator {
  id: string;
  kind: LmwaresValidationKind;
  label: string;
  description: string;
  timeoutMs: number;
  available: boolean;
  unavailableReason: string | null;
}

export interface LocalRunnerStatus {
  schemaVersion: 1;
  runnerVersion: string;
  projectId: string;
  repo: string;
  enabled: boolean;
  reasonCode: string | null;
  reason: string | null;
  validators: LocalRunnerValidator[];
}

export interface LocalRunnerResult {
  schemaVersion: 1;
  runnerVersion: string;
  runId: string;
  projectId: string;
  validatorId: string;
  kind: LmwaresValidationKind;
  label: string;
  status: Exclude<LmwaresValidationStatus, 'skipped'>;
  command: string;
  environmentPolicy: 'minimal';
  sourceRevision: string | null;
  gitDirty: boolean | null;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  stdoutTail: string;
  stderrTail: string;
  stdoutSha256: string;
  stderrSha256: string;
  outputTruncated: boolean;
  spawnError: string | null;
  summary: string;
  artifactPath: string;
}

export async function getLocalRunnerStatus(projectId: string): Promise<LocalRunnerStatus> {
  const query = new URLSearchParams({ projectId });
  return runnerRequest<LocalRunnerStatus>(`/__lmwares/runner/status?${query}`, {
    cache: 'no-store',
  });
}

export async function runLocalValidator(
  projectId: string,
  validatorId: string,
): Promise<LocalRunnerResult> {
  return runnerRequest<LocalRunnerResult>('/__lmwares/runner/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lmwares-Runner': '1',
    },
    body: JSON.stringify({ projectId, validatorId }),
  });
}

async function runnerRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? `Runner local no disponible (${response.status}).`);
  }
  return payload;
}
