import { useEffect, useMemo, useState } from 'react';
import {
  LMWARES_APPROVAL_GATES,
  LMWARES_VALIDATION_KINDS,
  LMWARES_VALIDATION_STATUSES,
  type LmwaresApproval,
  type LmwaresApprovalDecision,
  type LmwaresApprovalGate,
  type LmwaresProject,
  type LmwaresProjectSnapshot,
  type LmwaresValidationKind,
  type LmwaresValidationResult,
  type LmwaresValidationStatus,
} from '@starter/domain';
import { api } from '../../lib/api';
import { LocalRunnerCard } from './LocalRunnerCard';

interface ProjectControlPanelProps {
  project: LmwaresProject;
  snapshots: LmwaresProjectSnapshot[];
  enabled: boolean;
}

export function ProjectControlPanel({ project, snapshots, enabled }: ProjectControlPanelProps) {
  const [validations, setValidations] = useState<LmwaresValidationResult[]>([]);
  const [approvals, setApprovals] = useState<LmwaresApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationSaving, setValidationSaving] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationKind, setValidationKind] = useState<LmwaresValidationKind>('typecheck');
  const [validationStatus, setValidationStatus] = useState<LmwaresValidationStatus>('passed');
  const [validationSummary, setValidationSummary] = useState('');
  const [approvalGate, setApprovalGate] = useState<LmwaresApprovalGate>('validation');
  const [approvalComment, setApprovalComment] = useState('');

  const latestSnapshot = snapshots[0] ?? null;
  const latestByGate = useMemo(() => {
    const result = new Map<LmwaresApprovalGate, LmwaresApproval>();
    for (const approval of approvals) {
      if (!result.has(approval.gate)) result.set(approval.gate, approval);
    }
    return result;
  }, [approvals]);

  useEffect(() => {
    if (!enabled) {
      setValidations([]);
      setApprovals([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFeedback(null);
    Promise.all([
      api.listLmwaresProjectValidations(project.id),
      api.listLmwaresProjectApprovals(project.id),
    ])
      .then(([validationItems, approvalItems]) => {
        if (cancelled) return;
        setValidations(validationItems);
        setApprovals(approvalItems);
      })
      .catch((error) => {
        if (!cancelled)
          setFeedback(errorMessage(error, 'No se pudo leer el control del proyecto.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, project.id]);

  async function saveValidation() {
    if (!enabled) return;
    setValidationSaving(true);
    setFeedback(null);
    try {
      const created = await api.createLmwaresProjectValidation(project.id, {
        snapshotId: latestSnapshot?.id ?? null,
        kind: validationKind,
        status: validationStatus,
        label: validationKindLabel(validationKind),
        summary: validationSummary.trim() || null,
        sourceRevision: project.branch,
        artifactPath: project.repo,
        metadata: {
          phase: project.phase,
          progress: project.progress,
          health: project.health,
          recordingMode: 'manual-evidence',
        },
      });
      setValidations((current) => [created, ...current]);
      setValidationSummary('');
      setFeedback('Validación registrada como evidencia; Oracle no ejecutó ningún comando.');
    } catch (error) {
      setFeedback(errorMessage(error, 'No se pudo registrar la validación.'));
    } finally {
      setValidationSaving(false);
    }
  }

  async function saveApproval(decision: LmwaresApprovalDecision) {
    if (!enabled) return;
    const remoteGate = approvalGate === 'staging' || approvalGate === 'production';
    if (decision === 'approved' && remoteGate && !latestSnapshot) {
      setFeedback('Guarda un snapshot antes de aprobar staging o producción.');
      return;
    }
    setApprovalSaving(true);
    setFeedback(null);
    try {
      const created = await api.createLmwaresProjectApproval(project.id, {
        snapshotId: latestSnapshot?.id ?? null,
        gate: approvalGate,
        decision,
        comment: approvalComment.trim() || null,
        metadata: {
          phase: project.phase,
          progress: project.progress,
          deployTriggered: false,
        },
      });
      setApprovals((current) => [created, ...current]);
      setApprovalComment('');
      setFeedback('Decisión registrada. No se ejecutó ni se preparó ningún despliegue.');
    } catch (error) {
      setFeedback(errorMessage(error, 'No se pudo registrar la decisión.'));
    } finally {
      setApprovalSaving(false);
    }
  }

  if (!enabled) {
    return (
      <p className="rounded-lg border border-dashed border-black/15 p-4 text-sm text-[#66736a]">
        Sincroniza el proyecto con D1 para habilitar validaciones y gates privados.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {import.meta.env.DEV ? (
        <LocalRunnerCard
          project={project}
          latestSnapshot={latestSnapshot}
          onValidationCreated={(validation) =>
            setValidations((current) => [validation, ...current])
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-black/10 bg-[#f8faf6] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
              Evidencia técnica
            </p>
            <h3 className="mt-1 text-base font-black">Registrar validación</h3>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#526158]">
            {validations.length} resultados
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#66736a]">
            Validador
            <select
              value={validationKind}
              onChange={(event) => setValidationKind(event.target.value as LmwaresValidationKind)}
              className="mt-1 w-full rounded-md border border-black/15 bg-white px-2 py-2 text-xs font-semibold normal-case tracking-normal text-[#26332b]"
            >
              {LMWARES_VALIDATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {validationKindLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#66736a]">
            Resultado
            <select
              value={validationStatus}
              onChange={(event) =>
                setValidationStatus(event.target.value as LmwaresValidationStatus)
              }
              className="mt-1 w-full rounded-md border border-black/15 bg-white px-2 py-2 text-xs font-semibold normal-case tracking-normal text-[#26332b]"
            >
              {LMWARES_VALIDATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {validationStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={validationSummary}
          onChange={(event) => setValidationSummary(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Resumen o referencia de la evidencia…"
          className="w-full resize-y rounded-md border border-black/15 bg-white px-3 py-2 text-xs leading-5 text-[#26332b]"
        />
        <button
          type="button"
          onClick={() => void saveValidation()}
          disabled={validationSaving}
          className="w-full rounded-md bg-[#17201b] px-3 py-2 text-xs font-black text-white disabled:opacity-45"
        >
          {validationSaving ? 'Registrando…' : 'Registrar evidencia'}
        </button>
        <p className="text-[11px] leading-4 text-[#66736a]">
          {latestSnapshot
            ? `Se vinculará al snapshot ${latestSnapshot.id.slice(0, 8)}.`
            : 'Se registrará a nivel proyecto; crea un snapshot para fijar una revisión exacta.'}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black">Resultados recientes</h3>
          {loading ? <span className="text-xs text-[#66736a]">Leyendo…</span> : null}
        </div>
        {validations.length === 0 && !loading ? (
          <p className="rounded-lg border border-dashed border-black/15 p-3 text-xs text-[#66736a]">
            Aún no existe evidencia técnica registrada.
          </p>
        ) : (
          <div className="space-y-2">
            {validations.slice(0, 6).map((validation) => (
              <article
                key={validation.id}
                className="rounded-lg border border-black/10 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black">{validation.label}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#66736a]">
                      {new Date(validation.createdAt).toLocaleString('es-MX')} ·{' '}
                      {validation.createdBy}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-black ${validationStatusClass(validation.status)}`}
                  >
                    {validationStatusLabel(validation.status)}
                  </span>
                </div>
                {validation.summary ? (
                  <p className="mt-2 text-xs leading-5 text-[#4d5d54]">{validation.summary}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-[#d8ded7] bg-white p-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66736a]">
            Gate humano
          </p>
          <h3 className="mt-1 text-base font-black">Registrar decisión</h3>
          <p className="mt-1 text-[11px] leading-4 text-[#66736a]">
            Solo owner/admin. La decisión queda auditada y nunca dispara deploy.
          </p>
        </div>
        <select
          value={approvalGate}
          onChange={(event) => setApprovalGate(event.target.value as LmwaresApprovalGate)}
          className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#26332b]"
        >
          {LMWARES_APPROVAL_GATES.map((gate) => (
            <option key={gate} value={gate}>
              {approvalGateLabel(gate)}
            </option>
          ))}
        </select>
        <textarea
          value={approvalComment}
          onChange={(event) => setApprovalComment(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Comentario de alcance o cambios solicitados…"
          className="w-full resize-y rounded-md border border-black/15 bg-white px-3 py-2 text-xs leading-5 text-[#26332b]"
        />
        <div className="grid grid-cols-3 gap-2">
          <DecisionButton
            label="Aprobar"
            tone="approve"
            disabled={approvalSaving}
            onClick={() => void saveApproval('approved')}
          />
          <DecisionButton
            label="Cambios"
            tone="changes"
            disabled={approvalSaving || !approvalComment.trim()}
            onClick={() => void saveApproval('changes-requested')}
          />
          <DecisionButton
            label="Rechazar"
            tone="reject"
            disabled={approvalSaving || !approvalComment.trim()}
            onClick={() => void saveApproval('rejected')}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-black">Estado de gates</h3>
        {LMWARES_APPROVAL_GATES.map((gate) => {
          const latest = latestByGate.get(gate);
          return (
            <div
              key={gate}
              className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-[#f8faf6] p-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-black">{approvalGateLabel(gate)}</p>
                <p className="mt-0.5 truncate text-[10px] text-[#66736a]">
                  {latest
                    ? `${new Date(latest.createdAt).toLocaleString('es-MX')} · ${latest.decidedBy}`
                    : 'Sin decisión'}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-black ${latest ? approvalDecisionClass(latest.decision) : 'bg-[#e8ece8] text-[#66736a]'}`}
              >
                {latest ? approvalDecisionLabel(latest.decision) : 'Pendiente'}
              </span>
            </div>
          );
        })}
      </section>

      {feedback ? (
        <p className="rounded-lg border border-black/10 bg-[#fffdf6] p-3 text-xs leading-5 text-[#4d5d54]">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function DecisionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: 'approve' | 'changes' | 'reject';
  disabled: boolean;
  onClick: () => void;
}) {
  const color =
    tone === 'approve'
      ? 'bg-[#0f6f50] text-white'
      : tone === 'changes'
        ? 'bg-[#fff0bd] text-[#6b5004]'
        : 'bg-[#fee2e2] text-[#991b1b]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2 py-2 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-40 ${color}`}
    >
      {label}
    </button>
  );
}

function validationKindLabel(kind: LmwaresValidationKind) {
  const labels: Record<LmwaresValidationKind, string> = {
    typecheck: 'Typecheck',
    build: 'Build',
    tests: 'Pruebas',
    'workers-dry-run': 'Workers dry-run',
    'd1-migrations': 'Migraciones D1',
    'visual-qa': 'QA visual',
    security: 'Seguridad',
    custom: 'Validación manual',
  };
  return labels[kind];
}

function validationStatusLabel(status: LmwaresValidationStatus) {
  const labels: Record<LmwaresValidationStatus, string> = {
    passed: 'Aprobada',
    failed: 'Fallida',
    blocked: 'Bloqueada',
    skipped: 'Omitida',
  };
  return labels[status];
}

function validationStatusClass(status: LmwaresValidationStatus) {
  if (status === 'passed') return 'bg-[#e5f7ee] text-[#0f6f50]';
  if (status === 'failed') return 'bg-[#feecec] text-[#a51d1d]';
  if (status === 'blocked') return 'bg-[#fff3cf] text-[#7a5b0b]';
  return 'bg-[#e8ece8] text-[#66736a]';
}

function approvalGateLabel(gate: LmwaresApprovalGate) {
  const labels: Record<LmwaresApprovalGate, string> = {
    contract: 'Contrato',
    visual: 'Experiencia visual',
    'local-operation': 'Operación local',
    validation: 'Validación',
    staging: 'Cloudflare staging',
    production: 'Producción',
  };
  return labels[gate];
}

function approvalDecisionLabel(decision: LmwaresApprovalDecision) {
  if (decision === 'approved') return 'Aprobado';
  if (decision === 'changes-requested') return 'Cambios';
  return 'Rechazado';
}

function approvalDecisionClass(decision: LmwaresApprovalDecision) {
  if (decision === 'approved') return 'bg-[#e5f7ee] text-[#0f6f50]';
  if (decision === 'changes-requested') return 'bg-[#fff3cf] text-[#7a5b0b]';
  return 'bg-[#feecec] text-[#a51d1d]';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
