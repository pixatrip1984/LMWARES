# Runbook: evaluacion asistida y arranque de intakes comerciales (Starter/Pro)

Este runbook describe como usar Copilot (en esta sesion, no de forma
autonoma/programada) para acelerar dos pasos del flujo comercial sin saltarse
tu aprobacion humana en ningun punto:

1. Evaluar y redactar el borrador de una oferta para un intake `submitted`
   (Fase 0, sin costo para el cliente).
2. Preparar el arranque de un proyecto ya aceptado y pagado (fase 1) con
   `lmwares-agent-runner`.

No reemplaza `docs/LMWARES-COMMERCIAL-FLOW-ON-GO-LIVE.md` (la fuente de
verdad del flujo/estados); lo complementa con el "como" operativo del dia a
dia.

## Que NO hace este runbook

- No envia nada al cliente por si solo. El unico mecanismo de aviso al
  cliente es el boton **Emitir oferta** que ya existe en
  `apps/admin-web/src/pages/CommercialIntakesPage.tsx`; tu sigues pulsandolo.
- No manda correo real. Emitir/aceptar oferta hoy solo genera notificacion
  `in_app` (el cliente la ve en su cuenta, pestana "Solicitudes comerciales").
- No usa Higgsfield ni genera contenido de catalogo/galeria.
- No corre en cron ni de forma programada. Lo disparas tu, cuando quieras
  revisar la cola, pidiendole a Copilot que corra el radar.
- No arranca un packet de `lmwares-agent-runner` sin que tu decidas lanzarlo
  (el runner ya exige politica/aprobacion por proyecto, ver
  `docs/LMWARES-AGENT-RUNNER.md`).

## Paso 1: ver el radar

Corre el script de solo lectura para ver que hay pendiente:

```powershell
pwsh scripts/lmwares-commercial-pipeline-status.ps1
```

Muestra dos tablas:

- **Pendientes de evaluar** (`submitted`): incluye el brief completo
  (contacto, telefono, negocio, objetivo del sitio, estilo).
- **Listas para arrancar** (`awaiting_provisioning`): fase 1 ya pagada,
  incluye el brief y los modulos contratados.

Usa `-Local` si quieres probarlo contra tu D1 local de desarrollo en vez de
produccion.

## Paso 2: evaluar y redactar una oferta (Fase 0)

Cuando tengas un intake `submitted` que quieras evaluar:

1. Pidele a Copilot (en esta sesion): *"Evalua el intake `<id>` del radar y
   redactame un borrador de oferta"*.
2. Copilot lee el brief + modulos + precio estimado (via Admin API o D1,
   solo lectura) y te entrega un borrador con: factibilidad, resumen de
   alcance (`scope_summary`), descripcion de implementacion
   (`implementation_description`), descripcion de mensualidad si aplica
   (`recurring_description`) y un monto sugerido dentro de tu tabla vigente
   (`packages/domain` -- `COMMERCIAL_PACKAGE_PRICING_CENTS`).
3. Tu copias/ajustas ese borrador directamente en el formulario de oferta de
   Paquetes (`/commercial-intakes`, panel de detalle del intake).
4. Tu pulsas **Tomar revision** (si sigue en `submitted`) y despues
   **Emitir oferta**. Esto es lo unico que notifica al cliente, y solo pasa
   cuando tu lo decides.

Recuerda: "Tomar revision" es Fase 0, sin costo. El cliente entra a Fase 1
solo cuando acepta la oferta y paga el primer 25%.

## Paso 3: preparar el arranque de un proyecto pagado

Cuando el radar muestre una orden en `awaiting_provisioning`:

1. Pidele a Copilot: *"Prepara el packet de arranque para la orden `<id>`"*.
2. Copilot usa el brief + modulos de esa orden para redactar un
   `packet.json` inicial (tareas de discover/implementacion) compatible con
   `lmwares-agent-runner` (`scripts/lmwares-agent-runner/`, ver
   `docs/LMWARES-AGENT-RUNNER.md`).
3. Tu revisas el packet, decides si lanzarlo con
   `npm run lmwares:agents:discover` / `lmwares:agents:launch` (o el comando
   vigente del runner) y confirmas la politica de aprobacion del proyecto.
4. El operador enlaza manualmente el proyecto real de Oracle en el panel de
   Paquetes (esto ya existe, sin cambios) una vez que el trabajo arranca.

## Resumen de compuertas humanas

| Paso | Quien decide | Mecanismo |
| --- | --- | --- |
| Evaluar intake (Fase 0) | Tu | Boton "Tomar revision" (ya existente) |
| Redactar oferta | Copilot te asiste, tu ajustas | Formulario de oferta (ya existente) |
| Notificar al cliente | Tu | Boton "Emitir oferta" (ya existente, unico canal) |
| Aceptar oferta | El cliente | Su cuenta (ya existente) |
| Arrancar el proyecto | Tu | `lmwares-agent-runner`, con tu politica de aprobacion |
| Publicar | Tu | Compuertas de fase 4 (ya existente) |
