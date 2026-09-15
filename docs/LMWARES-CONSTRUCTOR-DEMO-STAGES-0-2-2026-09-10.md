# Constructor de demos frontend · Etapas 0–2

Estado: implementadas localmente el 10 de septiembre de 2026. No se ejecutó
el runner, no se generó una demo, no se aplicaron migraciones remotas ni se
desplegó producción.

## Lo que ya queda protegido

- `DemoBuildSpec v1` es un snapshot inmutable, generado por el servidor sólo
  desde una oferta aceptada y su intake correspondiente.
- El expediente conserva alcance y contexto público del negocio, pero excluye
  nombre/teléfono de contacto, referencias privadas, dominio, importes,
  descuentos y términos internos.
- El runner recibe ese expediente, valida que corresponde exactamente al job,
  intake, lifecycle y oferta aceptada, y lo guarda como evidencia local.
- La generación de copy para la demo ya no recibe el intake crudo: recibe sólo
  el `DemoBuildSpec` inmutable.
- Los jobs ahora tienen `lease_token` y `execution_generation`; completar,
  fallar y renovar requieren token vigente. Un runner reclamado de nuevo no
  puede terminar el intento anterior.
- El runner renueva su lease cada 30 segundos y se detiene antes de entregar
  si lo pierde.

## Archivos principales

- `packages/domain/src/models/commercial-demo-build.ts`
- `packages/domain/src/services/commercial-demo-build-spec.ts`
- `packages/db/src/repositories/lmwares-commercial-demo-build-specs.ts`
- `infra/d1/migrations/0042_lmwares_commercial_demo_build_specs.sql`
- `infra/d1/migrations/0043_lmwares_commercial_demo_job_leases.sql`
- `workers/public-api/src/routes/commercial-agent-internal.ts`
- `scripts/lmwares-commercial-demo-runner/cli.mjs`

## Verificación hecha

- `node --test tests/commercial-demo-build-spec.test.mjs tests/commercial-scope.test.mjs tests/commercial-scope-storage.test.mjs`: 16 pruebas correctas.
- `npm run typecheck`: correcto en los 12 paquetes.
- `npm run db:migrate:local`: 0042 y 0043 aplicadas correctamente sólo a D1 local.

## Siguiente etapa

Implementar el ejecutor aislado y el contrato de parches del constructor. El
runner actual sigue escribiendo una plantilla HTML fija; no debe activarse como
si ya construyera el frontend personalizado final. La evolución a React,
recursos, build completo y releases inmutables corresponde a las etapas 3–6
del plan maestro.
