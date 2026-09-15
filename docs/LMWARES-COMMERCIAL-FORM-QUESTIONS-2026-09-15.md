# Formulario comercial de LMWares

Documento editable con la versión actual del formulario al **15 de septiembre de 2026**.

## Dónde está implementado

- Catálogo de preguntas, opciones, IDs y reglas condicionales: `apps/public-web/src/features/package-builder/businessInterviewModel.ts`.
- Renderizado del cuestionario: `apps/public-web/src/features/package-builder/CommercialInterview.tsx`.
- Validación del brief que se envía con la solicitud: `packages/validation/src/package-intake.ts`.
- La pantalla de `apps/admin-web/src/pages/CommercialIntakesPage.tsx` es revisión administrativa; no es el formulario que contesta el cliente.

## Convenciones para editar este documento

- Conserva el `id` y los `value` salvo que también quieras cambiar el contrato técnico.
- `single` permite una respuesta; `multiple` permite varias; `text` es texto libre.
- Las preguntas marcadas como **Condicional** sólo aparecen cuando se cumple su regla.
- En preguntas `multiple`, el límite indicado es el máximo de selecciones.

## Cuestionario de entrevista

### Datos de contacto y negocio

1. **`contact_name`** — `text`, obligatorio  
   **Pregunta:** ¿Con quién coordinaremos esta solicitud?  
   **Ayuda:** Tu nombre o el de la persona responsable.  
   **Placeholder:** `Ej. Ana López`

2. **`contact_phone`** — `text`, obligatorio  
   **Pregunta:** ¿Cuál es tu teléfono o WhatsApp?  
   **Ayuda:** Sólo para coordinar la propuesta.  
   **Placeholder:** `Ej. 55 1234 5678`

3. **`business_name`** — `text`, obligatorio  
   **Pregunta:** ¿Cómo se llama tu negocio?  
   **Ayuda:** El nombre que te gustaría mostrar públicamente.  
   **Placeholder:** `Ej. Taller Norte`

4. **`business_model`** — `single`, obligatorio  
   **Pregunta:** ¿Qué hace principalmente tu negocio?
   - `products` — Vende productos (tienda, distribución o catálogo)
   - `services` — Presta servicios (atención profesional o técnica)
   - `manufacturing` — Fabrica productos (taller, producción o piezas)
   - `rentals` — Renta cosas o espacios
   - `projects` — Construye, instala o gestiona proyectos
   - `appointments` — Atiende citas o reservaciones
   - `food` — Sirve alimentos o bebidas
   - `other` — Otra actividad

5. **`business_model_other`** — `text`, obligatorio cuando `business_model = other`  
   **Pregunta:** Cuéntanos brevemente qué actividad realizan.  
   **Placeholder:** `Ej. Administramos inmuebles para renta`

6. **`industry`** — `single`, obligatorio  
   **Pregunta:** ¿Cuál se parece más a tu giro?
   - `retail` — Comercio y distribución
   - `health_beauty` — Salud, clínica o estética
   - `professional` — Servicios profesionales
   - `construction` — Construcción e instalación
   - `hospitality` — Alimentos, hospedaje o experiencias
   - `education_fitness` — Escuela, gimnasio o bienestar
   - `creative_manufacturing` — Taller, fabricación o creatividad
   - `other` — Otro giro

### Oferta, clientes y ventas

7. **`offer_type`** — `multiple`, obligatorio, máximo 3  
   **Pregunta:** ¿Qué ofreces a tus clientes?  
   **Ayuda:** Elige todo lo que aplique.
   - `products` — Productos
   - `services` — Servicios
   - `projects` — Trabajos por proyecto
   - `rentals` — Rentas
   - `subscriptions` — Suscripciones
   - `appointments` — Citas o reservaciones

8. **`lead_sources`** — `multiple`, obligatorio, máximo 4  
   **Pregunta:** ¿De dónde suelen llegar tus clientes?  
   **Ayuda:** Elige las fuentes más importantes.
   - `local` — Local físico
   - `referrals` — Recomendaciones
   - `social` — Redes sociales
   - `whatsapp` — WhatsApp
   - `google` — Google
   - `website` — Sitio actual
   - `salespeople` — Vendedores
   - `marketplace` — Marketplace
   - `advertising` — Publicidad

9. **`sales_start`** — `single`, obligatorio  
   **Pregunta:** ¿Cómo suele comenzar una venta?
   - `direct_purchase` — Compra directamente
   - `information` — Primero pide información
   - `quote` — Primero pide cotización
   - `appointment` — Primero agenda una cita
   - `visit` — Primero solicita una visita
   - `mixed` — Depende del caso

10. **`sales_channels`** — `multiple`, obligatorio, máximo 4  
    **Pregunta:** ¿Dónde ocurre normalmente esa venta?
    - `store` — En el local
    - `whatsapp` — Por WhatsApp
    - `phone` — Por teléfono
    - `website` — En la página
    - `social` — En redes sociales
    - `onsite` — En domicilio del cliente

11. **`website_goals`** — `multiple`, obligatorio, máximo 4  
    **Pregunta:** ¿Qué debería ayudarte a hacer la página?  
    **Ayuda:** Elige las prioridades reales.
    - `explain` — Explicar lo que hacemos
    - `catalog` — Mostrar catálogo
    - `contacts` — Recibir contactos
    - `quotes` — Recibir cotizaciones
    - `bookings` — Permitir citas o reservas
    - `sell` — Vender
    - `projects` — Mostrar proyectos
    - `locations` — Mostrar ubicaciones
    - `menu` — Mostrar menú
    - `visits` — Solicitar visitas

### Operación interna (condicionales)

12. **`inventory_tracking`** — `single`, obligatorio cuando aplique  
    **Pregunta:** ¿Necesitas saber cuántas piezas quedan?  
    **Opciones:** `yes` — Sí; `no` — No.  
    **Aparece si:** ofreces `products` o `rentals`, buscas `catalog` o `sell`, o tu modelo es `products`, `manufacturing` o `rentals`.

13. **`appointment_management`** — `single`, obligatorio cuando aplique  
    **Pregunta:** ¿Necesitas organizar citas, reservas o disponibilidad?  
    **Opciones:** `yes` — Sí; `no` — No.  
    **Aparece si:** ofreces `appointments`, buscas `bookings`, tu modelo es `appointments` o la venta inicia con `appointment`.

14. **`project_tracking`** — `single`, obligatorio cuando aplique  
    **Pregunta:** ¿Necesitas saber en qué etapa va cada trabajo?  
    **Opciones:** `yes` — Sí; `no` — No.  
    **Aparece si:** ofreces `projects`, buscas `quotes` o `visits`, tu modelo es `projects` o la venta inicia con `quote`.

15. **`customer_records`** — `single`, obligatorio  
    **Pregunta:** ¿Necesitas conservar historial de clientes recurrentes?  
    **Opciones:** `yes` — Sí; `no` — No.

16. **`team_size`** — `single`, obligatorio  
    **Pregunta:** ¿Cuántas personas participan hoy?
    - `solo` — Sólo yo
    - `2_5` — 2 a 5 personas
    - `6_20` — 6 a 20 personas
    - `21_plus` — Más de 20 personas

17. **`team_access`** — `single`, obligatorio cuando `team_size` no es `solo`  
    **Pregunta:** ¿Más de una persona necesitaría entrar al sistema?  
    **Opciones:** `yes` — Sí; `no` — No.

18. **`role_permissions`** — `single`, obligatorio cuando `team_access = yes`  
    **Pregunta:** ¿Cada persona debería ver cosas diferentes?  
    **Opciones:** `yes` — Sí; `no` — No.

19. **`follow_up`** — `single`, obligatorio  
    **Pregunta:** ¿Necesitas recordar seguimientos o próximas acciones?  
    **Opciones:** `yes` — Sí; `no` — No.

### Marca y materiales

20. **`brand_tone`** — `multiple`, obligatorio, máximo 3  
    **Pregunta:** ¿Qué debería transmitir tu presencia?  
    **Ayuda:** Elige hasta tres sensaciones.
    - `premium` — Premium
    - `technical` — Técnico
    - `trustworthy` — Confiable
    - `artisanal` — Artesanal
    - `modern` — Moderno
    - `warm` — Cálido
    - `minimal` — Minimalista
    - `industrial` — Industrial
    - `elegant` — Elegante
    - `energetic` — Energético

21. **`content_assets`** — `multiple`, obligatorio, máximo 6  
    **Pregunta:** ¿Con qué material cuentas hoy?  
    **Ayuda:** No tienes que subirlo todavía.
    - `logo` — Logo
    - `photos` — Fotos
    - `texts` — Textos
    - `catalog` — Catálogo
    - `prices` — Precios
    - `social` — Redes sociales
    - `existing_site` — Página anterior
    - `none` — Todavía no tengo nada

22. **`existing_site_url`** — `text`, opcional cuando `content_assets` incluye `existing_site`  
    **Pregunta:** ¿Cuál es la dirección de tu página actual?  
    **Ayuda:** Opcional; sirve sólo como referencia.  
    **Placeholder:** `https://...`

23. **`additional_context`** — `text`, opcional  
    **Pregunta:** ¿Hay algo importante que debamos saber?  
    **Ayuda:** Sólo si no apareció en las preguntas anteriores.  
    **Placeholder:** `Ej. Tenemos dos sucursales o una fecha importante.`

## Campos del brief enviado con la solicitud

Estos campos se completan a partir de la entrevista (y pueden conservar valores previos):

- `contactName` — nombre de contacto, obligatorio.
- `contactPhone` — teléfono o WhatsApp, obligatorio.
- `businessName` — nombre del negocio, obligatorio.
- `businessSummary` — resumen del negocio, obligatorio.
- `siteGoal` — objetivo de la página, obligatorio.
- `stylePreference` — preferencia de estilo, opcional.
- `referenceNotes` — notas o referencias, opcional.
- `customDomainPreference` — preferencia de dominio personalizado, opcional.
- `maintenancePlanPreference` — preferencia de mantenimiento:
  - `later` — Decidir después (valor inicial)
  - `none` — Sin mantenimiento
  - `basic` — Mantenimiento básico
  - `advanced` — Mantenimiento avanzado
- `maintenanceSecurityAddOn` — complemento de seguridad: `true` (sí) / `false` (no).

## Selección de paquete y módulos

La entrevista sugiere módulos, pero el configurador también conserva la selección explícita:

### Plan

- `free` — Gratis
- `starter` — Starter
- `pro` — Pro

### Módulos

- `landing` — Sitio web (base)
- `panel` — Panel (base)
- `blog` — Blog
- `galleries` — Galerías
- `catalog` — Catálogo
- `quote` — Formulario
- `events` — Eventos
- `docs` — Docs
- `cart` — E-Commerce (Pro)
- `data` — AI Optimization (Pro)

Otros valores del borrador: `marketing` (`true`/`false`) e `images` (archivos de referencia, con límite de 5 imágenes en el plan gratuito).

## Notas para la próxima versión

Escribe aquí los cambios deseados de redacción, orden, opciones, obligatoriedad o lógica condicional. Al devolverme una versión editada, compararé los IDs y prepararé la actualización del formulario y su validación.

