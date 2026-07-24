# Runner local LMWARES

Estado: operativo y bloqueado por defecto.

## Propósito

El runner ejecuta validadores conocidos en repos locales explícitamente
autorizados. No es una shell remota, no acepta comandos del navegador y no tiene
ninguna operación de deploy.

El Admin Worker continúa siendo el dueño de D1. El runner vive únicamente en el
proceso local de Vite y desaparece del build de producción.

## Controles

- La petición contiene solo `projectId` y `validatorId`.
- El catálogo fija script, tipo y timeout.
- La ruta descubierta por el scan debe coincidir con la política local.
- La ruta real debe permanecer dentro de `devRoot` incluso con symlinks.
- Cada proyecto declara `trust: "trusted-local"` y sus validadores exactos.
- Los procesos usan `shell: false` y un entorno mínimo sin variables de secretos.
- Solo existe una ejecución simultánea por proyecto.
- stdout y stderr se acotan, se hashean y pasan por redacción antes de persistirse.
- Un timeout termina el árbol del proceso.
- La evidencia queda en `.lmwares/runs/`, ignorada por Git.
- La mutación HTTP exige loopback, origen exacto, JSON y cabecera local.

Los scripts npm pertenecen al repo ejecutado y pueden contener código. Por eso
este runner solo sirve para proyectos locales confiables. Código de terceros o
multiusuario requerirá aislamiento real, por ejemplo Cloudflare Sandbox, y una
política distinta.

## Catálogo v1

| Id                  | Script fijo                | Efecto esperado                      |
| ------------------- | -------------------------- | ------------------------------------ |
| `typecheck`         | `npm run typecheck`        | Validación TypeScript general.       |
| `workers-typecheck` | `npm run typecheck:workers`| Validación TypeScript solo Workers.  |
| `build`             | `npm run build`            | Construcción local.                  |
| `tests`             | `npm run test`             | Suite declarada por el repo.         |
| `workers-dry-run`   | `npm run check:workers`    | Empaquetado Wrangler sin deploy.     |

No existen adaptadores para migraciones, staging, producción, secretos, Git
push ni comandos personalizados.

## Autorizar un proyecto

La política real es local e ignorada por Git:

```powershell
Copy-Item config/lmwares-runner-policy.example.json .lmwares/runner-policy.local.json
```

Después se reemplaza el ejemplo con un proyecto ya presente en el scan:

```json
{
  "schemaVersion": 1,
  "devRoot": "C:\\dev",
  "projects": {
    "cliente": {
      "enabled": true,
      "repo": "C:\\dev\\cliente",
      "trust": "trusted-local",
      "validators": ["typecheck", "build"]
    }
  }
}
```

Editar un manifest del proyecto no puede conceder permisos al runner. La
autorización vive exclusivamente en Oracle.

## Operación

```powershell
npm run lmwares:scan
npm run lmwares:runner:doctor
npm run lmwares:runner:run -- <projectId> <validatorId>
npm run lmwares:runner:test
```

Desde `/projects`, la pestaña `Control` muestra el estado de la política. Cuando
un proyecto está autorizado, el resultado se guarda primero como evidencia
local y luego se registra en `lmwares_validation_results` mediante el Admin API.

## Límites actuales

- No hay aislamiento de red a nivel de sistema operativo.
- La redacción de salida es defensa en profundidad, no un detector universal de
  secretos.
- Cancelación manual y streaming todavía no están expuestos en la UI.
- La evidencia local aún no se sincroniza de forma autónoma si D1 está caído.
- Ninguna decisión de gate dispara una ejecución o despliegue.
