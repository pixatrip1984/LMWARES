# Brief para la Skill del desarrollador relampago

La Skill debe usar este repo como extension tecnica. El repo ofrece estructura,
scripts, seguridad y despliegue; la Skill aporta criterio de negocio, diseno,
preguntas al usuario y ejecucion por fases.

## Comportamiento esperado

- Trabajar en `C:\dev\<proyecto>`.
- Clonar este starter desde la rama versionada indicada.
- Abrir cada fase con preguntas de opcion multiple y permitir respuesta libre.
- Implementar autonomamente hasta cerrar la fase.
- Hacer commits por hito.
- Ejecutar smokes y preflights antes de marcar una fase como cerrada.
- Preparar mensajes breves para que el usuario se los envie al cliente cuando
  falte informacion.
- No desplegar ni tocar recursos reales sin autorizacion explicita.

## Reglas de venta y producto

- La primera entrega debe enganchar visualmente.
- El portal privado debe resolver trabajo real, no ser un adorno.
- Los planes iniciales son insuficientes: cada fase debe aclarar decisiones
  nuevas antes de ejecutar.
- La conversacion con el cliente forma parte del producto.
- El servicio suele ser administrado por nosotros: hosting, dominio opcional,
  mantenimiento, mejoras y gastos externos.
- Seguridad, privacidad y pruebas adversariales se tratan como parte del
  entregable, no como extra.

## Preguntas base por fase

Fase 1:

- Que vende el negocio?
- Quien es el cliente ideal?
- Que accion principal debe tomar?
- Que tono visual conviene?
- Que catalogo o servicios aparecen primero?

Fase 2:

- Que datos necesita el operador?
- Que estados internos existen?
- Que reglas o prioridades guian la atencion?
- Que datos son sensibles?
- Que debe eliminarse o minimizarse al cerrar un caso?

Fase 3:

- Quien revisa?
- Que debe validar el cliente?
- Que datos de prueba se usaran?
- Que cambios bloquean cobro o avance?
- Que precio inicial y mantenimiento tienen sentido?

Fase 4:

- Que slug bajo `lmwares.com` se usara?
- Que correos entran a Access?
- Que recursos Cloudflare se crean?
- Que secretos se cargan?
- Que E2E demuestra que staging funciona?

## Limites

No incluir todavia automatizacion de anuncios, videos IA, campanas, SEO avanzado
o dominio final. Esa fase debe usar otra Skill y otro repo.
