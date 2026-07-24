import { RUNNER_VERSION, VALIDATOR_CATALOG } from './catalog.mjs';
import { executeValidator } from './execute.mjs';
import { inspectRunnerProject, RunnerError } from './policy.mjs';

export function createRunnerService({
  scanPath,
  policyPath,
  runsRoot,
  catalog = VALIDATOR_CATALOG,
  npmCliPath,
  outputLimitBytes,
}) {
  const activeProjects = new Set();

  return {
    async status(projectId) {
      const inspection = await inspectRunnerProject({ projectId, scanPath, policyPath, catalog });
      return publicStatus(inspection);
    },

    async run(projectId, validatorId) {
      if (typeof validatorId !== 'string' || !catalog.has(validatorId)) {
        throw new RunnerError(422, 'invalid_validator', 'Validador no permitido.');
      }
      if (activeProjects.has(projectId)) {
        throw new RunnerError(
          409,
          'project_busy',
          'Ya existe una validación activa para el proyecto.',
        );
      }

      const inspection = await inspectRunnerProject({ projectId, scanPath, policyPath, catalog });
      if (!inspection.enabled || !inspection.repoPath) {
        throw new RunnerError(403, inspection.reasonCode ?? 'runner_disabled', inspection.reason);
      }
      if (!inspection.validatorIds.includes(validatorId)) {
        throw new RunnerError(
          403,
          'validator_not_authorized',
          'La política no autoriza este validador.',
        );
      }
      const validatorStatus = inspection.validators.find((item) => item.id === validatorId);
      if (!validatorStatus?.available) {
        throw new RunnerError(
          409,
          'validator_script_missing',
          validatorStatus?.unavailableReason ?? 'El script npm requerido no existe.',
        );
      }

      activeProjects.add(projectId);
      try {
        return await executeValidator({
          projectId,
          repoPath: inspection.repoPath,
          validator: catalog.get(validatorId),
          runsRoot,
          npmCliPath,
          outputLimitBytes,
        });
      } finally {
        activeProjects.delete(projectId);
      }
    },
  };
}

function publicStatus(inspection) {
  return {
    schemaVersion: 1,
    runnerVersion: RUNNER_VERSION,
    projectId: inspection.projectId,
    repo: inspection.repo,
    enabled: inspection.enabled,
    reasonCode: inspection.reasonCode,
    reason: inspection.reason,
    validators: inspection.validators,
  };
}

export { RunnerError } from './policy.mjs';
