import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  LmwaresProject,
  LmwaresProjectSnapshot,
  LmwaresValidationResult,
} from '@starter/domain';
import { api } from '../../lib/api';
import {
  getLocalRunnerStatus,
  runLocalValidator,
  type LocalRunnerResult,
  type LocalRunnerStatus,
} from '../../lib/local-runner';

interface LocalRunnerCardProps {
  project: LmwaresProject;
  latestSnapshot: LmwaresProjectSnapshot | null;
  onValidationCreated: (validation: LmwaresValidationResult) => void;
}

export function LocalRunnerCard({
  project,
  latestSnapshot,
  onValidationCreated,
}: LocalRunnerCardProps) {
  const [status, setStatus] = useState<LocalRunnerStatus | null>(null);
  const [selectedValidator, setSelectedValidator] = useState('');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<LocalRunnerResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const operationRef = useRef(0);

  const availableValidators = useMemo(
    () => status?.validators.filter((validator) => validator.available) ?? [],
    [status],
  );

  useEffect(() => {
    operationRef.current += 1;
    let cancelled = false;
    setStatus(null);
    setRunning(false);
    setLastRun(null);
    setFeedback(null);
    getLocalRunnerStatus(project.id)
      .then((nextStatus) => {
        if (cancelled) return;
        setStatus(nextStatus);
        const firstAvailable = nextStatus.validators.find((validator) => validator.available);
        setSelectedValidator(firstAvailable?.id ?? '');
      })
      .catch((error) => {
        if (!cancelled) setFeedback(errorMessage(error, 'No se pudo consultar el runner local.'));
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  async function execute() {
    if (!selectedValidator || !status?.enabled) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    const projectId = project.id;
    setRunning(true);
    setFeedback(null);
    try {
      const run = await runLocalValidator(projectId, selectedValidator);
      if (operationRef.current === operation) setLastRun(run);
      const validation = await api.createLmwaresProjectValidation(projectId, {
        snapshotId: latestSnapshot?.id ?? null,
        kind: run.kind,
        status: run.status,
        label: `${run.label} · runner local`,
        summary: run.summary,
        sourceRevision: run.sourceRevision,
        artifactPath: run.artifactPath,
        metadata: {
          recordingMode: 'local-runner',
          runnerVersion: run.runnerVersion,
          runId: run.runId,
          validatorId: run.validatorId,
          command: run.command,
          environmentPolicy: run.environmentPolicy,
          exitCode: run.exitCode,
          signal: run.signal,
          timedOut: run.timedOut,
          durationMs: run.durationMs,
          gitDirty: run.gitDirty,
          outputTruncated: run.outputTruncated,
          stdoutTail: run.stdoutTail,
          stderrTail: run.stderrTail,
          stdoutSha256: run.stdoutSha256,
          stderrSha256: run.stderrSha256,
        },
      });
      if (operationRef.current !== operation) return;
      onValidationCreated(validation);
      setFeedback('Ejecución terminada y evidencia sincronizada con D1 privado.');
    } catch (error) {
      if (operationRef.current === operation) {
        setFeedback(errorMessage(error, 'El runner local no pudo completar la validación.'));
      }
    } finally {
      if (operationRef.current === operation) setRunning(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-[#173f31] bg-[#101813] p-3 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/55">
            Runner local
          </p>
          <h3 className="mt-1 text-base font-black">Validación controlada</h3>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-black ${status?.enabled ? 'bg-[#d9ffec] text-[#075b40]' : 'bg-white/10 text-white/70'}`}
        >
          {status?.enabled ? 'Autorizado' : 'Bloqueado'}
        </span>
      </div>

      {!status ? (
        <p className="text-xs leading-5 text-white/60">Consultando política local…</p>
      ) : status.enabled ? (
        <>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-white/55">
            Validador permitido
            <select
              value={selectedValidator}
              onChange={(event) => setSelectedValidator(event.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-[#1b2921] px-3 py-2 text-xs font-semibold normal-case tracking-normal text-white"
            >
              {availableValidators.map((validator) => (
                <option key={validator.id} value={validator.id}>
                  {validator.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] leading-4 text-white/55">
            {availableValidators.find((validator) => validator.id === selectedValidator)
              ?.description ?? 'Selecciona un validador.'}
          </p>
          <button
            type="button"
            onClick={() => void execute()}
            disabled={running || !selectedValidator}
            className="w-full rounded-md bg-[#d9ffec] px-3 py-2 text-xs font-black text-[#075b40] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {running ? 'Ejecutando y capturando evidencia…' : 'Ejecutar validador permitido'}
          </button>
        </>
      ) : (
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-black">Ejecución denegada por defecto</p>
          <p className="mt-1 text-[11px] leading-5 text-white/60">{status.reason}</p>
          <p className="mt-2 font-mono text-[10px] leading-4 text-[#b8d8c8]">
            config/lmwares-runner-policy.example.json → .lmwares/runner-policy.local.json
          </p>
        </div>
      )}

      {lastRun ? (
        <div className="rounded-md border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black">{lastRun.label}</p>
            <span className="text-[10px] font-black uppercase text-[#b8d8c8]">
              {lastRun.status} · {lastRun.durationMs} ms
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-white/60">{lastRun.summary}</p>
          {lastRun.stderrTail || lastRun.stdoutTail ? (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-[10px] leading-4 text-white/65">
              {(lastRun.stderrTail || lastRun.stdoutTail).slice(-2_000)}
            </pre>
          ) : null}
        </div>
      ) : null}

      {feedback ? <p className="text-[11px] leading-5 text-[#d8e9df]">{feedback}</p> : null}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
