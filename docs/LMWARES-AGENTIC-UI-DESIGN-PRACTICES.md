# LMWares: prácticas agénticas para diseño visual image-first

Fecha: 2026-07-23  
Estado: memoria de trabajo para una futura evolución de `desarrollador-relampago`  
Decisión: no modificar todavía la skill

## 1. Aprendizaje principal

Para proyectos visualmente ambiciosos, el diseño no debe comenzar escribiendo
componentes. Una imagen permite discutir composición, jerarquía, densidad,
ritmo, color y narrativa mucho más rápido que una implementación incompleta.

El flujo correcto es:

```text
visión
→ referencia visual
→ corrección por sección
→ aprobación
→ extracción de activos
→ implementación
→ QA en navegador
→ animación y detalle
```

Una primera imagen no es el entregable final. Es un contrato visual temporal
entre usuario y agente.

## 2. Trabajar una sección a la vez

Una página extensa debe dividirse en escenas o pantallas con una sola idea
dominante:

1. Definir qué debe comprender el visitante.
2. Elegir la metáfora visual.
3. Generar una propuesta.
4. Corregirla hasta aprobarla.
5. Registrar tipografía, layout, imágenes, movimiento y reglas responsive.
6. Continuar con la siguiente sección.

La revisión conjunta sucede al final para homogeneizar:

- Tamaños tipográficos.
- Márgenes y densidad.
- Contornos.
- Intensidad de luces.
- Colores.
- Ritmo de animación.
- Relación con el fondo continuo.

## 3. Imagen de referencia frente a activo de producción

Son dos artefactos distintos.

### Referencia visual

Puede contener toda la composición para decidir cómo debería verse la pantalla.

### Activo de producción

Debe generarse específicamente para el contenedor real:

- Aspect ratio exacto.
- Punto focal dentro del área visible.
- Margen seguro.
- Sin textos que luego se repetirán en HTML.
- Sin navegación dibujada si la navegación será interactiva.
- Sin bordes si el componente ya genera el borde.

Recortar una imagen grande para llenar diez tarjetas suele producir contenido
aplastado, títulos cortados y márgenes inconsistentes. Cada activo importante
debe generarse o editarse para su propio rectángulo.

## 4. Regla de texto

El texto crítico vive en código:

- Nombre del módulo.
- Título.
- Descripción.
- Precio.
- Estado.
- Botones.
- Etiquetas accesibles.

La imagen aporta evidencia visual, producto, interfaz, textura y atmósfera.

No se debe pedir al generador que escriba contenido que necesite ser exacto. Si
una imagen incluye texto ambiental, éste no debe competir con el texto real.

Ejemplo correcto:

```text
[imagen de un panel de solicitudes]
Panel
Administra solicitudes, estados y seguimiento.
```

Ejemplo incorrecto:

```text
[imagen que ya dice Panel]
Panel
Administra solicitudes...
```

## 5. Respuesta gráfica, no símbolo genérico

Una tarjeta de Blog no debe mostrar un ícono de documento. Debe mostrar una
porción convincente de un blog.

Una Galería debe parecer una colección curada.

Un Catálogo debe mostrar productos o servicios organizados.

Un Formulario debe mostrar un flujo sencillo para enviar una solicitud.

Un Panel debe parecer un portal de trabajo: tablas, solicitudes, estados y
acciones. No un tablero decorativo de gráficas.

Optimization debe comunicar un cerebro operativo:

- Señales vivas.
- Evidencia.
- Patrones.
- Hipótesis.
- Restricciones.
- Decisiones.
- Experimentos.
- Aprendizaje.

El cliente puede ver resultados simplificados. El agente LMWares puede ver el
workspace analítico completo.

## 6. Composición de tarjetas

Cada tarjeta debe tener tres capas inequívocas:

1. Contenedor y estado interactivo.
2. Imagen con padding interior.
3. Etiqueta y texto en HTML.

Reglas:

- Conservar un solo contorno, no borde exterior más borde interior.
- Mantener gap entre imagen y contorno luminoso.
- Usar el mismo tamaño de etiqueta para tarjetas equivalentes.
- Definir `object-position` por activo si el punto focal lo requiere.
- No depender sólo de un borde fino para comunicar selección.
- Al seleccionar, cambiar fondo, luz, contraste, etiqueta y estado; no sólo el
  color del marco.

## 7. Generación por geometría

Antes de generar, el agente debe conocer:

- Ancho y alto reales del contenedor.
- Resolución de referencia.
- Recorte desktop y móvil.
- Área ocupada por texto.
- Área segura para el sujeto.
- Comportamiento `cover` o `contain`.

Prompt base:

```text
Create a production asset for a web card with an exact [aspect ratio].
Keep the focal content inside the central safe area.
Do not add titles, logos, navigation, borders, buttons or readable brand names.
The image will sit behind HTML labels.
Visual direction: [direction].
Subject: [real graphical answer].
```

Si la tarjeta cambia mucho entre desktop y móvil, conviene producir dos
variantes o usar una composición con suficiente espacio seguro; no forzar el
mismo recorte.

## 8. Fondos continuos y navegación

Cuando seis pantallas representan secciones de una escena horizontal:

- El fondo debe ser una tira continua y loopeable.
- La navegación cambia la posición del fondo, no la imagen completa de golpe.
- El contenido entra y sale sobre la misma trayectoria visual.
- La transición conserva dirección.
- Las luces, partículas y líneas pueden moverse a velocidad menor que el
  contenido para crear profundidad.

El fondo no debe competir con las tarjetas. Los activos internos deben
complementarlo con otra escala, material o lenguaje.

## 9. Animación

La animación se agrega después de validar layout e imágenes.

Orden recomendado:

1. Movimiento de navegación entre pantallas.
2. Entrada y salida de bloques.
3. Luces y contornos.
4. Movimiento ambiental.
5. Hover y selección.
6. Microinteracciones.

No usar cambios instantáneos de `src` en áreas grandes. Para contenido dinámico:

- Precargar la imagen siguiente.
- Mantener la altura estable.
- Superponer estado anterior y siguiente.
- Hacer crossfade con leve desplazamiento o enfoque.
- Cambiar texto e imagen bajo una misma transición.
- Respetar `prefers-reduced-motion`.

## 10. Previews navegables

Un preview dinámico debe separar el chrome interactivo de la imagen.

### Patrón preferido

Generar una imagen de contenido sin header ni pestañas. Implementar en código:

- Cambio Public/Admin.
- Pestañas de módulos.
- Cerrar.
- Editar selección.
- Continuar.
- Estados activos.

### Patrón aceptable

Reservar en la imagen una banda neutra donde el código colocará la navegación.

### Patrón que debe evitarse

Generar un screenshot completo con tabs visibles y después colocar otras tabs
encima. Aunque los controles de código funcionen, el resultado parece duplicado,
desfasado y puede impedir la navegación.

Los hotspots invisibles sobre una imagen sólo sirven para prototipos muy
cerrados. No son adecuados cuando las pestañas cambian según los módulos del
paquete.

## 11. Módulos que LMWares debe conocer

### Base

- Landing.
- Panel.

### Starter

- Blog.
- Galerías.
- Catálogo.
- Formulario.
- Eventos.
- Docs.

### Pro

- Carrito.
- Optimization.

Reglas:

- Starter: base + hasta dos complementos.
- Pro: selección abierta, incluidos Carrito y Optimization.
- Free: página informativa, no una landing completa.
- Catálogo público incluye listado y detalle.
- La landing no tiene editor cliente en Admin por ahora.

## 12. Qué hace el cliente en Admin

- Blog: publicar y editar.
- Galerías: cargar, ordenar y retirar.
- Catálogo: agregar y actualizar elementos.
- Formulario: gestionar solicitudes.
- Eventos: programar y actualizar.
- Docs: mantener documentación.
- Carrito: gestionar pedidos y precios.
- Optimization: consultar resultados.

El rediseño de la landing y la operación profunda de Optimization permanecen
como servicios de LMWares.

## 13. Mantenimiento básico y avanzado en la interfaz

El diseño del portal debe cambiar según la modalidad:

### Básico

Presenta las herramientas completas de autogestión de los módulos contratados.

### Avanzado

Presenta una interfaz más pequeña:

- Nueva solicitud.
- Adjuntos.
- Conversación.
- Aprobaciones.
- Avances.
- Resultados.

No se trata de bloquear arbitrariamente funciones. Se trata de reflejar quién
es responsable de operar el sistema.

## 14. Ciclo de revisión con el usuario

El agente debe:

1. Mostrar la imagen.
2. Esperar una decisión clara.
3. Aplicar sólo la corrección pedida.
4. No reciclar una composición aprobada para otra sección si eso empobrece la
   narrativa.
5. No implementar hasta que la referencia quede aprobada, salvo que el usuario
   lo solicite.
6. Una vez implementado, revisar en el navegador con el viewport real.
7. Corregir recortes y posiciones tarjeta por tarjeta.
8. Hacer una pasada final sólo de detalle y movimiento.

El feedback coloquial o severo sigue siendo información de diseño. Debe
traducirse a una corrección concreta sin discutir el tono.

## 15. QA visual obligatorio

Por cada pantalla:

- No hay texto cortado.
- No hay imágenes estiradas.
- No hay duplicación de nombres dentro y fuera de la imagen.
- Los puntos focales se ven.
- Los gaps son consistentes.
- Sólo hay un contorno.
- Las etiquetas equivalentes tienen el mismo tamaño.
- La selección es evidente sin depender de un color mínimo.
- El contenido dinámico no parpadea.
- Las imágenes están precargadas.
- La navegación sigue siendo clicable.
- El foco de teclado es visible.
- La pantalla funciona con movimiento reducido.

Revisar al menos:

- Desktop objetivo.
- Laptop estrecha.
- Tablet.
- Móvil.

## 16. Organización de activos

Cada activo debe tener:

- Módulo.
- Contexto Public/Admin.
- Variante.
- Aspect ratio.
- Fuente o prompt.
- Fecha.
- Estado de aprobación.

Ejemplo:

```text
assets/
  package-builder/
    landing/
      selector-v2.webp
    preview/
      public/
        inicio-v3.webp
        catalogo-v2.webp
        catalogo-detalle-v1.webp
      admin/
        catalogo-v2.webp
        resultados-cliente-v1.webp
```

No usar nombres como `final-final-2.png`.

## 17. Información que debe pasar a un WARE

La dirección visual no debe quedar sólo en el chat:

- Referencias aprobadas.
- Paleta.
- Tipografías.
- Receta de composición.
- Geometrías.
- Aspect ratios.
- Reglas de movimiento.
- Elementos protegidos.
- Estados responsive.
- Criterios de aceptación.
- Inventario de activos.

Oracle debe poder comparar la implementación con esas decisiones.

## 18. Cambios futuros propuestos para `desarrollador-relampago`

Sin modificar todavía la skill, una evolución debería:

1. Añadir una fase explícita de concepto image-first.
2. Exigir geometría antes de generar activos.
3. Distinguir referencia visual y activo de producción.
4. Añadir una plantilla de prompt por contenedor.
5. Incluir matriz de módulos por plan.
6. Incorporar mantenimiento básico/avanzado.
7. Añadir QA de recorte, duplicación de texto y contornos.
8. Añadir estrategia de precarga y transición.
9. Registrar activos aprobados en el WARE.
10. Evitar la implementación “parecida” cuando el usuario aprobó imágenes
    concretas.

## 19. Definición de terminado visual

Una sección no termina cuando “se parece” a la imagen. Termina cuando:

- Comunica la misma idea.
- Conserva la jerarquía.
- Usa activos adecuados a sus contenedores.
- Responde correctamente.
- Se anima sin parpadeos.
- Es navegable.
- Mantiene legibilidad.
- El usuario la aprueba en el navegador.

## 20. Principio final

> La imagen define lo que queremos ver; el código debe convertir esa visión en
> una interfaz real, flexible y navegable, no esconder una captura detrás de
> botones.
