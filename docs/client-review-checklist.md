# Checklist de revision privada del cliente

La revision privada sirve para que el cliente pruebe el producto antes de poner
dominio final, datos reales o campanas publicas.

## Antes de enviar el enlace

- [ ] El sitio publico carga sin errores visibles.
- [ ] El portal privado carga detras de Access.
- [ ] Los correos autorizados fueron agregados a la politica.
- [ ] Los datos de prueba estan identificados como prueba.
- [ ] El formulario publico crea registros reales en staging.
- [ ] El portal permite revisar, comentar y cambiar estado sin romper auditoria.
- [ ] Turnstile real esta activo.
- [ ] CORS funciona desde los hostnames de staging.

## Mensaje sugerido

```text
Te comparto una liga privada de revision. Todavia no es el dominio final; sirve
para que pruebes el flujo, el formulario y el portal antes de publicarlo.

Usa datos de prueba. Entra al portal con este correo autorizado: <correo>.

Quiero que revises principalmente:
1. si los productos/servicios estan bien acomodados,
2. si el formulario pide lo correcto,
3. si el portal te ayuda a trabajar las solicitudes,
4. que informacion sobra o falta.
```

## Decisiones que debe cerrar el cliente

- Productos o servicios finales.
- Campos obligatorios del formulario.
- Textos legales y aviso de privacidad.
- Correos que tendran acceso al portal.
- Alcance incluido en el pago inicial.
- Mantenimiento mensual y gastos externos.
- Fecha tentativa de lanzamiento final.
