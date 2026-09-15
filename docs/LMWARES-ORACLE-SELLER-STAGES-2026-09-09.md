# Oracle Seller: etapas ejecutables y activación

Fecha: 2026-09-09. Estado: planificación. No se ha ejecutado ninguna etapa por redactar este archivo.

Referencias normativas: [maestro](LMWARES-ORACLE-SELLER-MASTERPLAN-2026-09-09.md), [contratos C01–C14](LMWARES-ORACLE-SELLER-CONTRACTS-2026-09-09.md), [validación](LMWARES-ORACLE-SELLER-VALIDATION-2026-09-09.md).

## S00. Reglas comunes para cualquier agente ejecutor

Antes de editar, leer instrucciones aplicables del repositorio y RTK. Leer la sección de su etapa, invariantes I01–I20 del maestro, contratos C referenciados y pruebas indicadas. Identificar commits/cambios que constituyen sus dependencias; «se hizo antes» sin evidencia no las satisface.

El checkout actual contiene cambios de Phase 0/runner y cambios de seguridad ajenos. El release aislado anterior no equivale al HEAD completo actual. No usar `git add .`, limpiar el worktree, resetear, cambiar de rama sobre trabajo ajeno ni publicar toda la carpeta para simplificar. Preparar un conjunto revisable de cambios o worktree aislado basado en el estado autorizado, incluyendo dependencias necesarias y dejando fuera cambios ajenos. No dejar atrás archivos nuevos necesarios solo por estar untracked.

Esta división permite asignar etapas a agentes distintos después; no autoriza delegación ni ejecución automática durante la planificación actual. Integración mantiene un solo contrato de datos; ningún agente crea un pipeline alternativo para terminar su interfaz antes.

Entregable obligatorio por etapa: código/migraciones locales y documentación acotados, decisiones aplicadas, tests/resultados, compatibilidad verificada, comandos utilizados, archivos, limitaciones reales, cómo desactivar la funcionalidad, próximo gate. Separar `IMPLEMENTED_LOCAL`, `VERIFIED_STAGING`, `DEPLOYED_DISABLED` y `ENABLED_PRODUCTION`; no llamar «listo» a todos indistintamente.

## S01. Grafo, orden y hito utilizable

```text
E00 Base verificada
 └─ E01 Modelo y expansión local
     ├─ E02 Vendedor, permisos y directorio
     └─ E03 Núcleo común, ofertas y economía congelada
         ├─ E04 Identidad y aceptación restringida (también necesita E02)
         ├─ E05 Motor comercial Flash
         └─ E06 Proyecto y trabajo productivo
             └─ E07 Revisión, publicación, ajustes y relojes
                 └─ E08 Continuación y Mercado Pago (también necesita E04)
E02–E08 ── E09 UX móvil, cuenta y conversación integrada
E09 ── E10 Ensayo de migración y compatibilidad completa
E10 ── E11 Validación adversarial, operación y preparación contractual
E11 ── E12 Despliegue controlado y piloto
```

La primera versión utilizable incluye E00–E12. No liberar E09 aislado porque la pantalla permita aceptar. E05 y E06 pueden desarrollarse independientemente después de acordar interfaces E03; requieren revisión conjunta antes de integrarse. Comisiones, marketplace e invitaciones avanzadas son etapas futuras, no entregables ocultos.

## E00. Baseline y expediente de implementación

**Objetivo:** fijar estado real y alcance de cambios sobre la aplicación existente.

**Dependencias:** este plan y autorización posterior para implementar. Riesgo: medio por worktree mixto.

**Deja funcionando:** no cambia producto; deja fixtures, inventario y un baseline reproducible para comparar regresiones.

**Trabajo:**

- Identificar HEAD, dirty/untracked, release previo y fuentes reales del runner, sin abrir `.env`/`.dev.vars` ni iniciar scripts.
- Inventariar rutas de identidad/propiedad, ofertas, checkout/webhook, demo, medios, módulos, dominio y legacy work order; recoger sus tests existentes.
- Crear fixtures locales representativos: Google existente, nuevo correo, email duplicado, Free, oferta emitida, aceptación demo_v1, sitio pagado, pago único histórico, cuatro fases, pago pendiente y dominio propio.
- Registrar discrepancias del maestro sección 3 como tareas de las etapas correctas; no «resolverlas» todas con una refactorización no revisada.
- Documentar catálogo de contratos HTTP existentes y referencias SQL. Definir IDs/alias de fixtures sin datos personales reales.

**Concepto que fija:** legacy es evidencia a preservar, no modelo que deba fingir el futuro.

**Verificación:** suite existente pertinente en entorno local aislado; resultado reproducible, sin requests reales a DeepSeek, Telegram, Mercado Pago ni runner. Inventario de gaps explícito; mocks no se confunden con prod.

**No resolver:** features, migración remota, proveedores legales ni UI. **Handoff:** baseline, inventario y fixtures para E01. **Reversión:** solo artefactos de prueba/documentación; no cambios de datos productivos.

## E01. Modelo común y expansión de esquema local

**Objetivo:** preparar cliente/negocio/representación, operación pre-cuenta, contratos/evidencia y proyecto canónico.

**Dependencias:** E00. Contratos C01–C03, C07. Invariantes I03–I05, I07, I17. Riesgo: alto por FKs y coexistencia.

**Deja funcionando:** esquema local migrable con lectores legacy todavía funcionales; nuevas escrituras deshabilitadas por flags.

**Trabajo:**

- Agregar tipos y validadores; evolucionar intakes/offers para draft sin usuario/precio completo sin inventar valores.
- Añadir identidad de Customer/Business y memberships; seller/assignment, contract/acceptance, comando/evento/outbox y entidades mínimas de continuidad.
- Adaptar client projects para existir antes de pago; mappings hacia lifecycle y registro interno. Evitar duplicar fases.
- Preparar repositorios/migraciones con constraints e índices de C03 y pruebas de re-ejecución/backfill en fixtures.
- FKs de evidencias/obligaciones no deben borrar el contrato por borrar usuario. Definir conservación/baja lógica.
- Introducir workflow_version y proyección legacy explícita; sin escritores independientes de los dos estados.

**Concepto:** usuario autenticado deja de ser requisito para preparar una venta; proyecto deja de nacer solo del pago.

**Verificación:** T-D01–D08, T-M01–M06; migrar fixture previo, insertar draft incompleto legítimo, cerrar constraints indebidas, foreign key check, IDs/órdenes/URLs iguales y reporte de conflictos.

**No resolver:** OTP, interfaz de invitaciones de representantes, comisiones o reescribir Free. **Handoff:** diccionario SQL, migrations, modelos/mappers y dataset migrado. **Reversión:** expansión compatible, sin down migration destructiva sobre datos con nuevos contratos.

## E02. Identidad de vendedor, permisos y directorio limitado

**Objetivo:** actor vendedor real, aislado del administrador y del cliente.

**Dependencias:** E01. Contratos C04 y C06. Invariantes I01–I03, I10–I11, I16. Riesgo: alto de permisos.

**Deja funcionando:** Sales API de borradores y búsqueda limitada; administrador puede habilitar/revocar vendedor y reasignar operaciones con auditoría.

**Trabajo:**

- Extraer verificador de personal Access sin reutilizar auto-provisionamiento administrativo; configurar audience/allowlist de Sales en desarrollo/staging.
- Crear `sales-api`, middleware por capacidad y pertenencia a operación; todos los listados/paginación filtran en servidor.
- Directorio de coincidencias exactas/minimizadas según maestro; no entrega historial ni confirma métodos de login.
- Implementar asignación única vigente, grants por operación y resolución de error de atribución append-only.
- Contexto admin separado para excepciones/producción. Capacidad seller no satisface `requireWrite` de admin.
- Auditoría de búsquedas/reasignaciones/revocaciones y límites contra enumeración.

**Concepto:** acceso comercial y atribución no son propiedad del cliente.

**Verificación:** T-A01–A10 con identidades reales de fixture, incluidos seller desactivado con JWT no vencido, otro vendedor, admin bajo contexto seller y endpoint manipulado.

**No resolver:** CRM, scoring, comisiones, asignación automática ni descubrimiento masivo de clientes. **Handoff:** matriz de permisos ejecutable y contratos seller. **Reversión:** desactivar portal y permisos, sin borrar actores/asignaciones históricas.

## E03. Núcleo único de propuesta y aceptación empresarial

**Objetivo:** extraer servicios comunes y congelar oferta económica/funcional antes del consentimiento.

**Dependencias:** E01; interfaz ActorContext de E02. Contratos C02–C03, C06–C09. Invariantes I04–I08, I12. Riesgo: alto de contratos/precios.

**Deja funcionando:** rutas actuales y nuevas llaman el mismo núcleo; generación de oferta determinista desde fixture y commit de aceptación comprobable sin UI nueva.

**Trabajo:**

- Implementar reviseBrief, compileOffer, reservePromotion, presentOffer, AcceptOffer y adapters web/admin/seller.
- Crear contenido/HTML canónico, hash, versionado, snapshots de política y cláusulas. Cerrar descuentos posteriores a aceptación y separar mantenimiento posterior.
- Reservar promociones con cupo al emitir; consumir una vez al aceptar; límites contra acaparamiento por vendedor.
- Excepción administrativa atada a hash; vendedor no altera prestaciones mediante texto o cantidades fuera de catálogo.
- Diseñar/probar lote D1 atómico C07 con prueba/actor sintéticos controlados solo en test, no endpoint de bypass.
- Identificar y cerrar rutas antiguas que puedan mutar una oferta accepted o emitir otra sin gestión de enmienda.

**Concepto:** una contratación es una aceptación atribuible de un documento exacto, no una cadena de updates oportunistas.

**Verificación:** T-O01–O12 y T-X01–X06: descuentos finales, carreras de emisión/aceptación, zero-row guard, misma key distinto payload, fallo entre efectos y enmienda sin duplicación.

**No resolver:** interfaz terminal, acceso anónimo ficticio, libre redacción legal, sistema general de prorrateo o devengo. **Handoff:** servicios/SQL transaction boundary, interfaces y pruebas. **Reversión:** flags de nuevas ofertas v2; no habilitar escritor legacy sobre ofertas v2 existentes.

## E04. Identidad de correo y terminal de aceptación

**Objetivo:** aceptar en dispositivo del vendedor sin suplantación de sesión ni registro previo del cliente.

**Dependencias:** E02–E03. Contratos C05–C07, C12. Invariantes I01–I03, I05, I12, I16, I18. Riesgo: crítico de identidad.

**Deja funcionando:** API y terminal mínimo de aceptación con email simulado/local; cuenta cliente resuelta/creada, recibo y retorno seguro a seller.

**Trabajo:**

- Implementar credenciales verificadas, linking Google y recuperación/duplicados sin merge por email automático indiscriminado.
- Terminal en origen dedicado, handoff, cookie limitada, OTP HMAC, envío cifrado efímero, grant y recibo de resultado.
- Bloqueo/desbloqueo real del contexto de vendedor tras entregar dispositivo; bfcache/Back no revelan panel activo.
- Consentimiento explícito con nombre/autoridad declarados y hash de oferta. Nunca `lmw_session` en terminal.
- Flujo propio con login correo/Google reciente y aceptación ligada a documento; no doble OTP si el mismo dispositivo ya probó identidad recientemente y cumple política.
- Resolver membresía de cliente/negocio existente; nuevo representante no adquiere negocio por una coincidencia de directorio.
- Recibo al cliente y caso administrativo de recuperación/controversia, sin aceptar por él.

**Concepto:** verificar, aceptar y obtener sesión normal son autorizaciones distintas.

**Verificación:** T-I01–I16, T-T01–T14, T-X02–X08. Inspección de cookies/red/storage/orígenes y adversarial de OTP replay/seller revocado/scan de email. No usar correo de cliente real durante desarrollo.

**No resolver:** WhatsApp/SMS, KYC documental, firma avanzada, biometría o auto-merge de cuentas ambiguas. **Handoff:** protocolo probado, pantallas mínimas, casos de error y medición de entrega en staging. **Reversión:** deshabilitar intents nuevos manteniendo acceso a recibos/contratos ya aceptados.

## E05. Flash como motor comercial verificable

**Objetivo:** interpretar necesidades imperfectas y producir máximo alcance viable sin inventar obligaciones.

**Dependencias:** E03. Contratos C09, C13. Invariantes I04–I06. Riesgo: alto de promesas y calidad comercial.

**Deja funcionando:** un motor para ambos canales; draft asistido revisable y autoemisión autónoma solo cuando pasa reglas.

**Trabajo:**

- Inventariar capacidades efectivas y redactar plantillas/versiones/límites con evidencia de implementación. Mantener unavailable cart/data/AstraMuses.
- Convertir prompt normativo y JSON ScopePlan en contrato real validado; corregir escapes/regex actuales con tests, sin depender de regex como único control.
- Preguntas materiales, alternativas, cobertura y trazabilidad por necesidad; separar prosa orientativa de cláusulas compiladas.
- Job comercial con revisión/hash, timeout, reintento acotado, presupuesto y resultado obsoleto descartado.
- Consumer de cola/outbox para ejecutar Flash fuera de la vida del request; prioridad de OTP independiente.
- Corpus de fixtures y evaluaciones; pruebas reales de Flash solo con datos sintéticos y autorización de implementación/prueba. Sin fallback de modelo.

**Concepto:** la IA propone y explica; servidor y catálogo determinan compromisos.

**Verificación:** T-F01–F12. Obligaciones no autorizadas = 0 en corpus de seguridad. Casos materiales ambiguos no autoemiten. Revisar calidad de cobertura con evaluador humano; no medir solo JSON válido.

**No resolver:** agente general con shell/webtools, anuncios/marketing, autonomía de precios, capacidades nuevas por prompt. **Handoff:** catálogo aprobado, prompt y dataset versionados, métricas de calidad/latencia/coste. **Reversión:** desactivar autoemisión y mantener revisión manual del mismo motor, no ofertas sin validación.

## E06. Proyecto canónico y trabajo Phase 0 compatible con runner

**Objetivo:** una contratación válida se transforma en trabajo independiente del canal y vendedor.

**Dependencias:** E01/E03; identidad de aceptación E04 para integración completa. Contratos C03.3, C07, C10. Invariantes I07–I10, I12–I14. Riesgo: alto de duplicación/pérdida de archivos.

**Deja funcionando:** proyectos/fases/trabajos generados por aceptación, runner v2 capaz de reclamar/entregar fixtures sin publicar.

**Trabajo:**

- Materializar un client_project_id estable, preservar lifecycle/slug y anexar work order pagada después.
- Separar scope comercial de WorkItem productivo y migrar/adaptar jobs demo actuales sin una segunda cola activa.
- Identidad persistida de executor, tokens revocables/aliases existentes, attempt/lease/fencing/heartbeat/timeout/sweeper.
- WorkInput sin vendedor/PII innecesaria; dedupe lógico por fase/tipo/generación.
- Conservar layout/ruta/starter; manifest y baselines; implementar manual_hold y protección frente a cambios humanos.
- Actualizar protocolo runner con feature negotiation; antiguo cliente no puede reclamar trabajos v2 sin fencing.

**Concepto:** Phase 0 es producción gratuita, y un ejecutor no es el vendedor ni el aprobador.

**Verificación:** T-P01–P12; dos clientes reclamando, lease perdido y entrega tardía, crash en último intento, aceptación repetida, workspace modificado. Primero harness con runner fake; runner local real solo contra trabajo sintético explícito en staging al llegar al gate correspondiente.

**No resolver:** marketplace, payout, editor remoto, instalación automática de daemon o generación demo de un cliente real sin autorización. **Handoff:** contrato runner v2, compatibilidad, fixtures y manual de recuperación. **Reversión:** claims deshabilitados; cola/evidencia se conserva.

## E07. Revisión, release, ajustes y disponibilidad

**Objetivo:** demo privada → revisión humana → demo presentada, con una ronda y plazos correctos.

**Dependencias:** E06. Contratos C10–C13; maestro sección 10. Invariantes I08, I13–I14, I19–I20. Riesgo: alto de exposición/estado.

**Deja funcionando:** revisor publica versión exacta; cuenta/URL muestran demo y fechas; cambios y retirada automatizada son recuperables.

**Trabajo:**

- Manifest inmutable, validación, preview aislada, puntero de release y comprobación de servicio antes de presentación.
- «Publicar y presentar» coordina aprobación/cierre técnico sin decidir continuación por cliente.
- Clasificación de defectos/ronda/nueva dirección, reserva de una ronda, conjunto de mensajes y trazabilidad a criterios.
- Ventanas de siete/treinta días, pausas/renovación legítima y eventos de re-presentación; no reset por GET/reenvío.
- Avisos en outbox, caducidad por servidor al servir, ficha retirada y conservación de archivos/slug.
- Cerrar bypass por `/media/*` y por hostname wildcard; ni entrega ni contrato se exponen por otra ruta.

**Concepto:** subir, aprobar, publicar, presentar y retirar son actos diferentes.

**Verificación:** T-R01–R13 y T-N01–N08; reloj inyectable, cron atrasado, request simultáneo, pago vs retirada, preview maliciosa y rutas alternas de assets.

**No resolver:** revisiones gratuitas infinitas, SSR general, migración masiva de sitios ajenos o purga destructiva de código. **Handoff:** política demo versionada y pruebas con reloj controlado. **Reversión:** pausar expiración/claims con motivo, conservar puntero anterior; no hacer públicos artefactos sin validación.

## E08. Continuación explícita, pagos y fases pagadas

**Objetivo:** continuar bajo contrato vigente y empezar implementación solo con dinero confirmado.

**Dependencias:** E04/E07. Contrato C08. Invariantes I05, I08–I09, I12, I15, I17. Riesgo: crítico financiero.

**Deja funcionando:** decisión cliente, reserva acotada, cuatro órdenes congeladas, Mercado Pago y fases del mismo proyecto.

**Trabajo:**

- Añadir ContinueImplementation idempotente; decisión no es nueva firma si no cambian condiciones.
- Reserva única 48h, checkout externo recuperable, elegibilidad de fase 1 y prepagos posteriores conforme maestro.
- Integrar todos los endpoints legacy/modernos con mismos guards de contrato/membresía/workflow; probar accesos directos.
- Conciliar confirmación, pendiente, duplicado, devolución, contracargo y pago tardío sin borrar dinero ni atribución.
- Enmiendas con dinero pendiente/pagado requieren revisión; impedir reprecio automático y mezclar obligaciones.
- Financiación de fase separada de ejecución y actualización de legacy work order mediante adaptador común.

**Concepto:** decisión, obligación, pago observado y elegibilidad productiva son registros distintos.

**Verificación:** T-B01–B15, regresiones existentes de pagos y fixtures single/four_phase; pruebas contractuales del proveedor en sandbox/staging. Verificar expiración y timestamps del proveedor antes de habilitar métodos de pago en este flujo.

**No resolver:** efectivo, transferencia manual, auto-reembolsos nuevos, comisiones, escrow ni impuestos inventados. **Handoff:** matriz de elegibilidad y prueba de callbacks/reconciliación. **Reversión:** deshabilitar nuevos checkouts; seguir recibiendo y conciliando pagos reales de órdenes existentes.

## E09. Experiencia móvil, cuenta y conversación

**Objetivo:** convertir APIs seguras en herramienta de cierre presencial usable en minutos.

**Dependencias:** E02–E08 integradas. Contratos C06; maestro secciones 5–13. Invariantes I01–I04, I18. Riesgo: medio/alto por recuperación y exposición visual.

**Deja funcionando:** flujo de vendedor completo, terminal, acceso posterior de cliente, seguimiento y revisión desde Oracle.

**Trabajo:**

- Home Sales: continuar borradores, operaciones esperando cliente, próximas acciones; sin dashboard CRM pesado.
- Cuatro bloques progresivos: cliente/negocio, necesidad/paquete, propuesta revisable, presentar/cerrar. Resumen fijo precio/alcance/guardado; evitar scroll a contenido que confunda con acción ya terminada.
- Autosave servidor con revisión; IndexedDB de borrador limitado por actor/dispositivo mientras sesión vigente, TTL y purga. Indicadores «guardado en dispositivo», «sincronizado», «requiere revisión». Nunca «aceptado» optimista.
- Visor compartido: entregables, límites, exclusiones, demo $0, pagos posteriores, mantenimiento opcional y fechas. Diferenciar demo visual de funcionalidades futuras.
- Presentar, enviar para después, retomar, perder/reabrir y negociar. Mensajes client_shared vs notas internas; cliente nunca ve razonamiento de negociación o datos de terceros.
- Cuenta por memberships: contratos/proyectos/pagos/demos de identidad correcta sin duplicar sitio tras pago. Mantener Free existente en su sección sin convertirlo en venta asistida.
- «Continuar», ronda disponible, vencimientos y retorno desde pago con next action inequívoca.
- Admin: reasignación, excepción, trabajo entregado, aprobar/corregir, ruta workspace, holds, casos y retry operable.

**Concepto:** asistencia comercial eficiente sin convertir al vendedor en cliente ni esconder estados pendientes.

**Verificación:** T-U01–U12, navegadores móviles/tablet/laptop, 360px, teclado virtual, zoom, accesibilidad, reconexión, Back/recarga, dos pestañas. Prueba guiada de visita completa con participantes ficticios.

**No resolver:** app nativa, mapas/rutas de vendedores, campañas, agenda compleja, offline completo o portal de comisiones. **Handoff:** recorrido grabado con datos sintéticos, mediciones y problemas corregidos. **Reversión:** portal flag off manteniendo autoservicio/contratos y recuperación de borradores.

## E10. Migración integral y compatibilidad histórica

**Objetivo:** demostrar que el nuevo modelo no pierde titulares, contratos, dinero, sitios ni trabajos existentes.

**Dependencias:** E09. Contratos C03 y C14. Invariantes I04, I12, I14, I17, I20. Riesgo: crítico de datos.

**Deja funcionando:** ensayo de migración completo y scripts/reporte listos, todavía sin ejecutar en producción.

**Trabajo y reglas:**

1. Snapshot/fixture controlado sin exponer PII; baseline de conteos/digests/referencias y contratos de acceso.
2. Backfill Customer/Business conservador: por relación heredada comprobada; no fusionar clientes solo por nombre/email. Registro `legacy_unresolved` para ambigüedad; resolución manual posterior.
3. `user_id` histórico da membresía con procedencia `legacy_ownership`, sin inventar OTP/representación documental.
4. Oferta aceptada histórica: preservar bytes y campos disponibles; evidencia de origen/fecha/método solo donde exista. Si importe/terms snapshot difieren por descuento o mantenimiento previo, registrar discrepancy; no «arreglar» el histórico adivinando qué vio el cliente.
5. Proyecto pagado existente prevalece como ID canónico; enlazar demo si existe y coincide. Demo sola recibe proyecto estable; conservar alias. Conflictos de slug/propiedad/work order quedan fuera del corte automático.
6. Fases pagadas y pagos legacy mantienen IDs, importes, referencias Mercado Pago y semántica original. No generar retrospectivamente Phase 0, ventanas de siete días ni retirada a treinta sobre clientes históricos.
7. Jobs demo_v1: detener nuevas claims durante corte autorizado, esperar/suspender intentos con fencing, mapear pending/completed/path/review; nunca ejecutar de nuevo una entrega ya terminada por migrarla.
8. Backfill de cada lote idempotente con checkpoint y reporte. Corte de escritor por workflow: una sola autoridad. Adapters legacy pueden leer/marcar proyección, no volver a crear contrato/proyecto.
9. Auditoría de todas las rutas de ownership, incluidos cuenta, módulos, documentos, dominios, pagos y previews. Ninguna ruta heredada concede acceso por email o user_id ajeno en v2.
10. Actualizar runbooks/README: corregir antigua definición de Phase 0, cobro al aceptar, inmutabilidad y alcance real del runner. Este plan se enlaza como documentación de implementación, no como prueba de despliegue.

**Verificación:** T-M01–M12; dry-run y dos ejecuciones de backfill con resultado estable; IDs/digests/foreign keys; pruebas de ownership y pagos antes/después. Muestra de cada categoría, no solo happy path nuevo.

**No resolver:** cleanup de usuarios ambiguos por heurística, borrar tablas viejas en el mismo despliegue o adoptar plazos nuevos silenciosamente para contratos anteriores. **Handoff:** scripts, checkpoints, informe y plan exacto de corte/recuperación. **Reversión:** mantener esquema expandido y procesar workflows existentes; no restaurar snapshot que borre contratos/dinero nuevos.

## E11. Validación adversarial y preparación operativa/contractual

**Objetivo:** que el piloto tenga evidencia de funcionamiento y rutas de excepción operables.

**Dependencias:** E10. Todos los invariantes. Riesgo: crítico de integración.

**Deja funcionando:** staging completo, fixtures sintéticos y expediente de readiness; producción todavía sin activar por esta etapa.

**Trabajo:**

- Ejecutar matriz de validación, comparación de dos canales y pruebas de carreras/crashes/revocaciones/aislamiento.
- Probar operador real como vendedor y como revisor con contextos distintos; verificar cierre y acceso posterior cliente sin navegador del vendedor.
- Ejecutar un trabajo sintético completo contra runner de staging solo cuando esté autorizado; preservar root/credenciales de producción y no reclamar cola real por error.
- Verificar email/Telegram hacia buzones/chats de prueba autorizados, sin imprimir claves/OTP; medir entrega, retries y dead letters.
- Ejercitar recuperación de pago pendiente, identidad duplicada, oferta desfasada, generación fallida, corrección y retirada/reactivación.
- Configurar perfil legal del prestador y validar términos, privacidad, impuestos, retención y mecanismo de conservación aplicable con evidencia. Si requiere proveedor/constancia, completar adapter y configuración o dejar explícito NO_GO contractual; no simular cumplimiento.
- Documentar operaciones de soporte, rotación de credenciales, backup/export/restore de prueba, budget cap Flash y alertas.
- Revisar carga paginada representativa de miles de operaciones y varios vendedores; índices/explain/query counts, no carga masiva contra producción.

**Verificación:** matriz completa con PASS/FAIL/NOT_TESTED y evidencia enlazada; ningún crítico abierto; restauración aislada probada; performance dentro del presupuesto de UX; métodos reales de identidad/pago sin headers de bypass.

**No resolver:** certificar jurídicamente por un test, auditoría genérica sin relación con riesgo, reputación/marketplace o piloto con clientes reales sin activación autorizada. **Handoff:** checklist go/no-go firmado operativamente por responsable y artefactos. **Reversión:** flags off y reintentos suspendidos; evidencia permanece.

## E12. Despliegue y piloto controlados

**Objetivo:** primera venta real desde teléfono con continuidad verificada y sin regresión.

**Dependencias:** E11, autorización posterior de despliegue/activación y configuración de lanzamiento completa. Riesgo: crítico de producción.

**Deja funcionando:** Seller MVP en producción con vendedor inicial y un núcleo común operativo para nuevas ventas.

**Secuencia:**

1. Preparar artefacto exacto/revisable desde source autorizado, dependencias congeladas y migraciones aprobadas; capturar versiones previas.
2. Aplicar expansión/backfill autorizado con checkpoint y checks; bloquear nuevas acciones donde haya transición incompatible. No bloquear webhooks de dinero.
3. Desplegar APIs/consumidor/UI con flags nuevos apagados; comprobar rutas/auth/health y legacy.
4. Configurar hostnames dedicados, Access, orígenes, scopes, secrets y preservación sin mostrar valores. Reservar nombres contra slugs y revisar rutas wildcard.
5. Habilitar vendedor inicial y cohorte v2; ambas entradas de operaciones nuevas usan el mismo núcleo. Los registros históricos mantienen su workflow.
6. Realizar piloto sintético/operativo autorizado y después primera operación real consentida. No usar un cliente como fixture sin su conocimiento.
7. Encender `PRODUCTION_CLAIMS_ENABLED` únicamente cuando el operador decida arrancar el runner y la cola correcta esté validada; no iniciar daemon ni scheduled task por el mero despliegue.
8. Acompañar aceptación→cuenta→trabajo→revisión→demo→continuación→pago→fase 1. Verificar cohortes durante 24–48h y primeros vencimientos mediante fixtures de staging, no acelerando plazos reales.
9. Mantener visibilidad de pendientes/retries/errores y dueño operacional. Solo ampliar vendedores después de cerrar defectos del piloto y demostrar aislamiento.

**Verificación:** T-E01–E05 en ambiente correcto y reporte separado local/staging/producción. Criterios finales del maestro sección 17 satisfechos; no declarar completada una venta cobrable porque solo se vio una pantalla.

**No resolver:** onboarding abierto de vendedores, pagos a terceros, reglas económicas futuras o contrato comercial de marketplace. **Reversión:** desactivar nuevas ventas/intents/claims/checkouts según incidente, conservar lectura de contratos y conciliación. Reparar hacia delante si ya hay nuevos contratos; no regresar código viejo que ignore datos v2.

## S02. Checkpoints de migración y ausencia de doble pipeline

| Momento | Escritor autorizado | Lectores | Regla |
|---|---|---|---|
| Antes de E01 | Código actual | Actual | Baseline preservado |
| Expansión local/staging | Código compatible | Legacy y nuevos en fixtures | V2 deshabilitado públicamente |
| Núcleo integrado | Servicios compartidos | DTOs por superficie | No lógica de aceptación dentro de una pantalla o ruta específica |
| Corte piloto | Un servicio por comando; workflow determina semántica histórica | Legacy adapters + UI nueva | Canal no selecciona otro motor |
| Estable | Núcleo común | Proyecciones compatibles | Retirar writers viejos; tablas/alias se contraen después, con evidencia |

No mantener «si seller, crear v2; si web, seguir viejo» como estado final del MVP. La cohabitación temporal solo sirve para contratos con semántica histórica y despliegue controlado.

## S03. Plantilla de encargo a un agente futuro

```text
Implementa exclusivamente la etapa E__ del plan Oracle Seller 2026-09-09.
Lee maestro, contratos y matriz de validación; aplica I01–I20.
Dependencias verificadas: [commits/artefactos/evidencia].
Workspace/branch autorizados: [ruta y base].
Entorno permitido: [local/staging]; acciones externas autorizadas: [explícitas].
No inicies runner ni reclames trabajos productivos fuera del gate autorizado.
Preserva cambios ajenos, IDs y semántica legacy; no crees otro pipeline.
Entrega cambios revisables, pruebas de la etapa, regresiones pertinentes,
limitaciones, estado local/staging/deployed/enabled y handoff de la siguiente.
Si una dependencia no satisface su contrato, informa el gap y resuelve dentro
del alcance autorizado; no inventes una integración alternativa.
```

## S04. Etapas posteriores expresamente diferidas

- Representantes autogestionados: invitaciones, roles finos por negocio, revocación y delegación, sobre memberships ya existentes.
- Comisiones: decidir base, porcentajes, elegibilidad, devengo, reservas, reversiones y payouts; introducir política efectiva y ledger, sin derechos retroactivos implícitos.
- Ejecución externa: onboarding/revocación de desarrolladores, descubrimiento de jobs elegibles, capacidades, términos y compensación. Reutiliza WorkItem/Attempt/Submission.
- Marketplace/reputación: reglas de asignación, disputas y evidencia antes de reputación pública. No sustituye la revisión por un puntaje IA.
- Nuevos canales de identidad/cobro: incorporar pruebas y conciliadores de propósito explícito, sin permitir que vendedor declare identidad o dinero.
- Alcance evolutivo: capacidades nuevas solo tras implementación/evidencia/catalogación, sin ampliar contratos viejos por actualizar el starter.
