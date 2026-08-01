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
- Los checkouts técnicos de sandbox permanecen cerrados en producción mediante una puerta independiente.
- La reconciliación del ensayo existente sigue activa para observar sus cobros programados.

## Lo que falta después de esta fase

- convertir una solicitud revisada en oferta versionada;
- aceptación explícita de la oferta;
- cobro real de implementación;
- compuerta de publicación que exija una suscripción activa;
- pruebas comerciales controladas de punta a punta.
