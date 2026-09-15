# Envío comercial sin respuesta: corrección y verificación

## Estado

Corrección implementada y desplegada en producción. No se creó una solicitud de prueba productiva, no se aceptó ninguna oferta, no se lanzó el runner ni se avanzó Phase 0.

- Public API: `de393050-c9eb-4d15-b0e2-43f814d4a196`.
- Public Pages: `https://6096cbcc.lmwares-public.pages.dev`, rama de producción `main`.
- Bundle público: `/assets/index-abQIDctG.js`.
- No hubo migraciones de datos ni cambios de secretos.

## Causas comprobadas en código

1. El navegador conservaba una clave de envío global aunque se editara el brief o la entrevista. El POST devolvía incondicionalmente cualquier solicitud anterior del mismo propietario con esa clave. El repositorio tampoco comparaba su contenido. Por eso podía producirse un falso éxito sin solicitud nueva, job ni aviso.
2. El cliente HTTP construía cabeceras JSON pero `...init` las reemplazaba al incluir `Idempotency-Key`.
3. La recepción comercial no disparaba un aviso inmediato; sólo se avisaba al emitir la propuesta o fallar la generación.
4. El encolado estaba dentro del trabajo posterior a la respuesta y podía omitirse por ausencia de clave. Flash permite hasta 55 segundos, incompatible con depender exclusivamente de la ventana posterior a la respuesta HTTP. La recuperación programada sólo se ejecutaba una vez por hora.
5. El portal no consultaba automáticamente los nuevos estados comerciales. El DTO de cuenta además omitía el brief esperado por el cliente.

La consulta de producción del 13 de septiembre encontró sólo la solicitud histórica `18c979dd-376d-4b21-aea6-1471092f3931`, creada el 9 de septiembre, y cero jobs comerciales. Esto confirma ausencia de una nueva solicitud persistida, pero NO prueba por sí solo si hubo un POST ni cuál de los fallos afectó exactamente al intento del usuario. No existen trazas capturadas de ese intento.

## Comportamiento corregido

- El cliente vincula la clave al digest del contenido y al usuario. Una edición cambia la clave; refresh/reintento del mismo contenido la conserva. Se ignora únicamente la variación de `completedAt` para este propósito. No se guarda información personal adicional en ese registro.
- El repositorio comprueba contenido en reintentos y en carreras de inserción. Cambiar brief, entrevista, descuento o paquete bajo una clave anterior da conflicto. La UI recupera las claves antiguas con un nuevo envío explícito. Nunca se sobrescribe el expediente antiguo.
- Un POST exitoso persiste el job `scope` antes de responder. Un reintento exacto puede reparar una interrupción del encolado. Las ofertas históricas no se vuelven a emitir por este mecanismo.
- La generación intenta comenzar inmediatamente mediante `waitUntil`, pero no depende de esa ventana: el scheduler comercial se ejecuta cada minuto y recupera leases interrumpidos de 90 segundos. La conciliación de pagos mantiene únicamente su horario anterior. No se promete un plazo exacto.
- La recuperación después de emitir una oferta reutiliza la oferta existente y no genera otra. Esto no reemplaza las protecciones del repositorio de ofertas frente a edición administrativa concurrente.
- Nueva solicitud: aviso al operador independiente de la finalización de Flash. Telegram reconoce `1` y `true`. Un fallo síncrono del correo no impide procesar Telegram. Las entregas operativas siguen siendo best-effort, con registro de fallos; no se afirma entrega garantizada ni se añadió un outbox transaccional.
- Tras enviar se abre Mis sitios, con referencia de solicitud. Mientras el centro de cuenta esté abierto se actualiza cada 15 segundos, sin borrar el contenido durante la consulta. Si la generación requiere intervención, se muestra ese estado sin exponer errores internos.
- La aceptación sigue siendo exclusivamente del cliente. Sólo ella habilita el trabajo de demo. La revisión humana antes de mostrar la demo al cliente no se modificó.

La separación entre trabajo durable y tareas HTTP de corta duración sigue las [guías de Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

## Pruebas

- `node --test tests/commercial-submission-recovery.test.mjs`: 6/6. SQLite aislado para recepción y carreras; ruta HTTP, esquema y middleware de sesión reales con repositorios de identidad/jobs y proveedor simulados. Comprueba cookies hasheadas, 401 sin sesión, creación, replay, conflicto por cambios, aviso único, generación programada, recuperación sin reemisión y configuración ausente con fallo registrado.
- Public API: 85/85.
- Public web: 23/23.
- Typecheck public-web/public-api/admin-api: correcto; build public-web y dry-run Worker correctos.
- Navegador de producción: sesión y Mis sitios abren, referencia histórica visible, sin errores de consola en las verificaciones realizadas. El borrador de entrevista se conservó.

Los proveedores de generación y Telegram de estas pruebas están simulados. No son una validación end-to-end real de sus credenciales productivas ni de la entrega al chat del operador.

## Siguiente prueba del usuario

1. Abrir/recargar `https://lmwares.com/configurar`, conservar el paquete comercial y revisar el diagnóstico guardado.
2. Pulsar **Enviar para revisión** una sola vez. Debe aparecer una referencia nueva en **Mis sitios**, distinta de `18c979dd`.
3. Debe llegar el aviso de recepción. El procesamiento programado prepara la propuesta; la tarjeta se actualiza sin otro envío. Si el proveedor falla, el job conserva el error y el portal indica revisión requerida.
4. El cliente revisa y acepta la propuesta. Sólo entonces el watcher de demos deja de esperar un trabajo inexistente.
5. Continuar Demo Studio hasta revisión administrativa; no aprobar automáticamente ni saltar la revisión visual.

Pendiente de evidencia: envío real del usuario con el código nuevo, recepción real en Telegram, respuesta real de Flash y recorrido posterior hasta revisión humana. No se marcó ese E2E como terminado.
