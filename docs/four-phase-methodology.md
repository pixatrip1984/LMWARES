# Metodologia de cuatro fases

Esta plantilla esta pensada para proyectos cliente construidos de principio a
fin con un agente de desarrollo. El repo aporta la base tecnica; el agente toma
decisiones de producto, venta, contenido y diseno.

## Fase 1 - Enganche visual

Objetivo: mostrar algo que el cliente pueda entender, navegar y desear.

Entregables:

- Web publica, landing, catalogo o store inicial.
- Formulario o flujo principal.
- Portal privado mock que sugiera valor operativo.
- Imagenes generadas o seleccionadas con intencion comercial.
- Contratos de datos iniciales y roadmap.

Preguntas clave:

- Que vende el negocio y a quien?
- Que accion debe tomar el prospecto?
- Que servicios o productos deben aparecer primero?
- Que tono conviene: premium, tecnico, calido, urgente, institucional?
- Que experiencia administrativa minima ayuda a vender?

## Fase 2 - Operacion local real

Objetivo: reemplazar mocks por backend local, persistencia, reglas y portal util.

Entregables:

- Workers locales.
- D1 local con migraciones y seeds.
- Validacion de entrada, errores consistentes y CORS.
- Portal privado conectado a API real.
- Auditoria, estados, notas, privacidad y redaccion/minimizacion.
- Smokes adversariales locales.

Preguntas clave:

- Que datos necesita el operador para trabajar?
- Que estados operativos existen?
- Que decisiones puede automatizar el sistema?
- Que datos son sensibles y cuanto tiempo se conservan?
- Que no debe ver nunca el usuario publico?

## Fase 3 - Revision privada y cierre comercial

Objetivo: que el cliente pruebe una version controlada antes de infraestructura
productiva final.

Entregables:

- URL privada o demo controlada.
- Checklist de validacion.
- Mensaje de revision para cliente.
- Ajustes derivados de feedback.
- Decision comercial: anticipo, mensualidad, gastos externos y responsables.

Preguntas clave:

- Quien debe revisar?
- Que datos de prueba usaremos?
- Que cambios bloquean el avance?
- Que queda para mantenimiento?
- Quien operara el servicio?

## Fase 4 - Staging administrado en Cloudflare

Objetivo: desplegar infraestructura real bajo subdominios administrados sin
necesitar aun el dominio final del cliente.

Entregables:

- Pages para web publica y portal.
- Workers publico y admin.
- D1 remoto migrado.
- R2 si hay archivos.
- Turnstile server-side.
- Cloudflare Access para portal/API admin.
- CORS exacto y E2E real.

Preguntas clave:

- Que slug usara el proyecto?
- Que correos tendran acceso?
- Que cuenta Cloudflare administra los recursos?
- Que secretos deben cargarse?
- Que prueba E2E confirma que esta listo?

## Fuera de esta plantilla

Dominio final, lanzamiento publico, SEO, indexacion, videos IA, campanas,
automatizaciones de redes y mantenimiento avanzado deben vivir en otro flujo o
repo especializado.
