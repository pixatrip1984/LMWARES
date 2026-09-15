# Sales / Flash: fallo de generación y contrato de prompts

## Evidencia y límites

La comprobación remota anterior encontró cero propuestas canónicas guardadas y una oportunidad draft. No se capturó la respuesta HTTP del intento original: no afirmar que hubo un error concreto del proveedor. El monitor anterior pasó por un filtro que podía retener salida; el monitor actual usa `rtk proxy` y confirmó conexión.

Defectos confirmados en código: max_tokens 1800 sin configurar thinking (DeepSeek documenta thinking high por defecto), sin timeout ni validación de finish_reason; error lejos de la tarjeta; salida generada nunca mostrada y sin lectura persistente. No había prompt fuerte en system: la política estaba mezclada con las notas en user. Los textos económicos y de implementación eran generados libremente. El runner no recibía la oferta aceptada y utilizaba el último scope job.

## Corrección

- Motor único `packages/domain/src/services/commercial-scope.ts` usado por Sales y Public API; política `lmwares.scope.v2`. Flash v4, thinking disabled explícito para esta redacción acotada, JSON mode, 2400 tokens, timeout 55s. Interfaz 70s. No hay reintentos automáticos que creen propuestas duplicadas.
- La política completa está en system; datos del negocio en JSON user. Precios se calculan en el servidor. Implementación y mantenimiento se construyen desde capacidades/preferencia autorizadas; Flash sólo redacta el resumen y el brief visual. Validación de estructura, longitudes, secciones únicas y menciones de compromisos restringidos. Esta validación no certifica toda la semántica de texto libre: la revisión del vendedor sigue siendo necesaria.
- Logs de resultado con estado HTTP, duración, longitud y finish_reason; nunca clave, cuerpo del proveedor, razonamiento ni notas del cliente.
- Resultado/error junto a la oportunidad, contador de espera, vista del alcance completo y endpoint GET con control de asignación. Reintentar una propuesta lista recupera la existente. Un POST exitoso no equivale a presentar, aceptar ni iniciar una demo.
- Guardado por comparación de versión, asignación vigente e INSERT condicionado dentro de batch. Si cambió la oportunidad, no se inserta una propuesta huérfana ni se sustituye la anterior.
- Claim del runner recibe la oferta aceptada de lifecycle.commercialOfferId y únicamente un brief de esa oferta. El prompt del runner está en `scripts/lmwares-commercial-demo-runner/demo-prompt.mjs`, valida contenido completo y conserva la oferta en metadatos locales para revisión.

## Límite de producto que permanece

El runner actual redacta contenido en una plantilla HTML estática fija. No es aún un agente que edite y compile libremente módulos React del proyecto clonado. Esta corrección no implementa ese constructor completo ni el puente pendiente de aceptación de Sales a Phase 0. No ejecutar demos para validar esta corrección. La plantilla y las restricciones deben mantenerse explícitas al evaluar lo que se puede vender.

## Verificación y operación

`node --test tests/commercial-scope.test.mjs tests/commercial-scope-storage.test.mjs` cubre JSON válido, truncamiento, respuesta vacía, error proveedor, fallo de red, economía controlada por servidor, menciones restringidas, lectura autorizada, cambio concurrente, revocación de asignación y oferta aceptada del runner. SQLite en memoria, sin escrituras de negocio remotas.

`npm run typecheck`; `npm run build --workspace @apps/admin-web`.

Desplegar Admin API y Public API con env production y keep-vars; Admin Pages con branch main. No borrar DEEPSEEK_API_KEY de Public API: el canal autónomo sí la necesita (la recomendación previa de retirarla era incorrecta). No se requieren migraciones. No arrancar el runner.

Comprobación final real: abrir /sales, pulsar Preparar alcance, observar el bloque junto a la oportunidad. Debe aparecer el alcance o un error específico, y Ver alcance debe recuperarlo al recargar. No declarar probado el proveedor ni el E2E autenticado hasta observar esa petición real.

Referencias: https://api-docs.deepseek.com/guides/thinking_mode/ y https://api-docs.deepseek.com/guides/json_mode/.

## Despliegue de esta corrección

- Admin Worker: `e8d603e1-7419-41ce-acd8-2c2319afc172`.
- Public Worker: `72a49a3c-7e98-46bf-9322-e163f7330e3f`.
- Admin Pages producción/main: `48b3e957`, bundle `index-CFk6cSdZ.js`.
- 14 pruebas aprobadas, typecheck completo aprobado, build Admin aprobado. Runner no ejecutado. No hubo una nueva petición autenticada durante la captura de logs; la respuesta real de DeepSeek con la cuenta del usuario permanece sin verificar.
