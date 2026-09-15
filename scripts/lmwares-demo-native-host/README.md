# LMWares Demo Native Host

Host local para la futura extensión privada de demos. Sólo acepta mensajes
`stage-download`: copia un ZIP ya descargado desde `LMWARES_DEMO_INCOMING_ROOT`
a `LMWARES_DEMO_STAGING_ROOT/<jobId>/<runId>/delivery.zip` tras verificar
nombre, tamaño y SHA-256. No ofrece lectura, borrado, shell ni rutas arbitrarias.

No está instalado como host de Chrome todavía: faltan el ID fijo de la variante
de extensión y el manifiesto `allowed_origins`. No ejecutar contra descargas
reales hasta completar esa integración y el validador de ZIP.
