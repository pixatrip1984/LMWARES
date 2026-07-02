# Playbook adversarial minimo

Antes de exponer staging a un cliente, prueba el sistema como si intentaras
abusarlo. Este documento no sustituye una auditoria formal, pero evita errores
basicos repetidos.

## Formulario publico

Prueba:

- JSON mal formado.
- `Content-Type` incorrecto.
- Cuerpos demasiado grandes.
- Campos extremadamente largos.
- HTML o scripts en campos libres.
- Valores fuera de catalogo.
- Turnstile ausente, expirado o invalido.
- Repeticion con el mismo correo/telefono.

Debe ocurrir:

- Respuestas 400/422/429 segun corresponda.
- Errores con shape estable.
- Nada de score, reglas internas o datos privados en la respuesta publica.

## Portal privado

Prueba:

- Acceso sin Cloudflare Access.
- CORS desde origen no autorizado.
- Mutaciones con usuario sin permisos.
- Cambios de estado invalidos.
- Notas vacias o muy largas.
- Operaciones sobre registros cerrados o depurados.

Debe ocurrir:

- 401/403/409 claros.
- Auditoria de acciones relevantes.
- Sin bypass de `X-Dev-Email` fuera de local.

## Archivos

Prueba:

- SVG/HTML/JS renombrado como imagen.
- Doble extension.
- MIME falso.
- PDF/Office con metadata.
- Duplicados.
- Nombres con datos personales.

Debe ocurrir:

- Rechazo o cuarentena.
- Reemision/saneamiento cuando aplique.
- Binarios solo en R2, no en D1.
- Metadata minima.

## Datos y privacidad

Prueba:

- Solicitudes repetidas con correo cambiado.
- Solicitudes repetidas con telefono cambiado.
- Ciudad falsa.
- Datos sensibles en notas.
- Cierre o redaccion de expediente.

Debe ocurrir:

- Coincidencias por identificadores fuertes, no por ciudad.
- Minimizacion de datos al cerrar.
- Hash irreversible si se conserva historial minimo.
- Auditoria sin IP/user-agent innecesarios tras redaccion, si el proyecto lo requiere.
