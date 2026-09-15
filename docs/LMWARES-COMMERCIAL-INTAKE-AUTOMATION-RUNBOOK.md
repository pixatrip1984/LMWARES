# Runbook: evaluacion asistida y arranque de intakes comerciales (Starter/Pro)

## Arquitectura local vigente (2026-09-14)

El operador ya no debe mantener una terminal con `npm run lmwares:demos:watch`.
`npm run lmwares:demos:install-listener` instala un supervisor oculto en la
carpeta **Inicio** de la sesión interactiva de Windows y lo arranca de inmediato.
El supervisor mantiene un único daemon liviano; si éste cae, lo reinicia. Un
lock atómico en `C:\dev\lmwares-demos\control\daemon.lock` impide que una
terminal, otro acceso de Inicio o un segundo supervisor consuman la misma cola.

El ciclo correcto es:

1. Enviar el intake encola y ejecuta el trabajo remoto de alcance con DeepSeek.
2. Aceptar esa oferta crea Phase 0 y encola el trabajo local `demo`.
3. El listener dormido detecta el trabajo (máximo 15 segundos), reclama un lease
   cercado y abre el perfil dedicado de Brave.
4. El launcher recarga la variante unpacked desde disco, conserva una sola
   pestaña supervisora y abre ChatGPT sin botones manuales.
5. Demo Studio genera, descarga, ensambla, valida y entrega el release privado a
   Oracle Admin.
6. Al quedar `submitted_for_review`, el runner archiva evidencia y cierra sólo
   el Brave cuyo `--user-data-dir` es `C:\dev\lmwares-demo-brave-profile`.
   El listener vuelve a dormir; el navegador personal no se toca.
7. La aprobación administrativa publica el release al cliente y completa Phase
   0. Esta compuerta no necesita mantener ChatGPT ni Brave abiertos.

Cloudflare no puede iniciar un proceso dentro de una PC detrás de NAT. Por eso
el listener permanece residente pero inactivo y barato; no abre navegador ni
consume ChatGPT mientras la cola está vacía. El evento remoto no se pierde si
la PC está apagada: el job permanece en D1 y será reclamado en el próximo inicio
de sesión.

### Concurrencia

La cola remota selecciona el job elegible más antiguo y el daemon procesa un
solo `active-run.json`. Si dos clientes aceptan casi al mismo tiempo, ambos jobs
quedan persistidos y se ejecutan FIFO, uno por uno. Un lease vencido se archiva
como intento abandonado y Oracle puede emitir una nueva
`execution_generation`; el resultado de una generación vieja no puede subir ni
pisar el release vigente.

### Instalación y diagnóstico

```powershell
npm run lmwares:demos:install-listener
```

Los registros operativos están en:

- `C:\dev\lmwares-demos\control\listener-supervisor.log`
- `C:\dev\lmwares-demos\control\listener.out.log`
- `C:\dev\lmwares-demos\control\listener.err.log`

`node scripts/lmwares-commercial-demo-runner/diagnose-browser.mjs` inspecciona
solamente la salud estructural del Brave dedicado; no lee el contenido de las
respuestas ni secretos. Si se intenta abrir un segundo daemon, debe terminar
con `Ya existe un listener de demos LMWares activo`.

> Actualización 2026-09-13: ver [corrección del envío comercial y prueba pendiente](LMWARES-COMMERCIAL-SUBMISSION-RECOVERY-2026-09-13.md). El job de alcance se persiste antes de responder, intenta arrancar inmediatamente y tiene recuperación programada cada minuto; no depende de que el navegador siga abierto. Las instrucciones manuales históricas de abajo no sustituyen este modo automático.

Este runbook describe dos modos de operación. El modo automático usa
`deepseek-v4-flash` para redactar alcances dentro del catálogo vigente y el
runner local para construir una demo; el modo manual sigue disponible para
casos que necesitan intervención humana.

1. Evaluar y redactar una oferta automática para un intake `submitted`.
2. Construir una demo privada tras aceptar la oferta.
3. Continuar el mismo proyecto local al pasar a fase 1.

## Modo automático DeepSeek Flash

Al recibir una solicitud, el Public API crea un trabajo `scope`. Si
`DEEPSEEK_API_KEY` (o el alias `deepseek_api_key`) está configurado, Flash
redacta el alcance pero no decide módulos, precio, condiciones ni exclusiones:
esas reglas provienen del catálogo y la tabla de precios del servidor.

Al aceptar la oferta se crea la fase 0 y un trabajo `demo`. El runner local
`npm run lmwares:demos:watch` consulta los trabajos, crea o reutiliza
`C:\dev\lmwares-demos\<slug>`, guarda `demo/index.html` y el expediente
`.lmwares/phase-0-agent.json`, y entrega una revisión privada a Oracle.

Oracle muestra la ruta local y permite abrir la revisión. Sólo **Aprobar demo
y mostrar al cliente** activa el subdominio. Después puedes cerrar fase 0 y
habilitar el primer pago. La misma carpeta se conserva para la implementación.

Configuración local del runner:

```powershell
Copy-Item scripts/lmwares-commercial-demo-runner/.env.example scripts/lmwares-commercial-demo-runner/.env
npm run lmwares:demos:watch
```

Para arrancarlo al iniciar sesión, tras completar ese `.env`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/lmwares-commercial-demo-runner/install-at-logon.ps1
```

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
