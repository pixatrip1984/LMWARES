# Flujo comercial LMWares: mantenimiento al publicar

Decisión vigente: **la mensualidad comienza al publicar el proyecto**, no durante la construcción.

## Secuencia autorizada

1. El cliente inicia sesión y arma Starter o Pro.
2. El configurador envía una solicitud comercial. No abre Mercado Pago ni crea un cobro.
3. Oracle revisa alcance, módulos y viabilidad con participación humana.
4. LMWares prepara una oferta final; la estimación pública no constituye todavía el precio contractual.
5. El cliente acepta y paga la implementación.
6. El proyecto se construye y valida en un subdominio `*.lmwares.com`.
7. Al llegar a la compuerta de publicación, el cliente autoriza la mensualidad.
8. LMWares comprueba la suscripción activa y publica. Desde ese momento empieza el mantenimiento mensual.
9. Starter y Pro pueden migrar después a dominio personalizado.

## Reglas del sistema

- La selección original del cliente se conserva como registro inmutable.
- Los importes se recalculan en el servidor; nunca se confía en un precio enviado por el navegador.
- Los reintentos usan una clave idempotente para no duplicar solicitudes.
- La revisión humana puede tomar la solicitud o rechazarla con notas.
- Cada oferta final se conserva como una versión inmutable; emitir una revisión
  reemplaza la versión visible sin borrar el historial anterior.
- El cliente debe revisar alcance, importes y términos y aceptar explícitamente
  la versión vigente desde su centro de cuenta.
- La aceptación es idempotente, queda auditada una sola vez y todavía no crea
  ningún cobro.
- Los checkouts técnicos de sandbox permanecen cerrados en producción mediante una puerta independiente.
- La reconciliación del ensayo existente sigue activa para observar sus cobros programados.

## Lo que falta después de esta fase

- cobro real de implementación;
- compuerta de publicación que exija una suscripción activa;
- pruebas comerciales controladas de punta a punta.

## Validación técnica de la oferta

- La primera oferta queda `superseded` al emitir una segunda versión.
- Sólo una versión puede permanecer `issued` por solicitud.
- Cada versión genera una notificación independiente dentro de la cuenta.
- Aceptar dos veces devuelve la misma aceptación y crea un solo evento de
  auditoría.
- La oferta no expone identificadores internos del operador y sólo puede ser
  consultada o aceptada por el usuario propietario de la solicitud.
