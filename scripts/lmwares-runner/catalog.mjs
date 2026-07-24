export const RUNNER_VERSION = 'lmwares.local-runner/v1';

const definitions = [
  {
    id: 'typecheck',
    kind: 'typecheck',
    label: 'Typecheck',
    description: 'Valida contratos TypeScript sin aceptar argumentos adicionales.',
    script: 'typecheck',
    timeoutMs: 5 * 60_000,
  },
  {
    id: 'workers-typecheck',
    kind: 'typecheck',
    label: 'Typecheck Workers',
    description: 'Valida únicamente los Workers mediante el script npm explícito del proyecto.',
    script: 'typecheck:workers',
    timeoutMs: 5 * 60_000,
  },
  {
    id: 'build',
    kind: 'build',
    label: 'Build',
    description: 'Construye los artefactos locales definidos por el proyecto.',
    script: 'build',
    timeoutMs: 10 * 60_000,
  },
  {
    id: 'tests',
    kind: 'tests',
    label: 'Pruebas',
    description: 'Ejecuta únicamente el script npm test declarado por el proyecto confiable.',
    script: 'test',
    timeoutMs: 10 * 60_000,
  },
  {
    id: 'workers-dry-run',
    kind: 'workers-dry-run',
    label: 'Workers dry-run',
    description: 'Empaqueta Workers con Wrangler sin desplegar recursos.',
    script: 'check:workers',
    timeoutMs: 10 * 60_000,
  },
];

export const VALIDATOR_CATALOG = new Map(
  definitions.map((definition) => [definition.id, Object.freeze({ ...definition })]),
);

export function publicValidator(definition, available, unavailableReason = null) {
  return {
    id: definition.id,
    kind: definition.kind,
    label: definition.label,
    description: definition.description,
    timeoutMs: definition.timeoutMs,
    available,
    unavailableReason,
  };
}
