# Continuacion: resiliencia de ejecuciones Demo Studio

Fecha: 2026-09-15
Estado: pendiente como siguiente objetivo; no reabrir el alcance comercial ya validado.

## Problema que debe resolver la siguiente iteracion

Demo Studio todavia puede quedar detenido si una generacion de ChatGPT no termina o se interrumpe mientras el operador usa otro navegador. El estado actual no distingue de forma suficientemente fiable entre una ejecucion que sigue viva, una que ya no puede avanzar y una que requiere recuperacion.

Ademas, la accion **Consultar trabajo** de la extension no esta logrando reanudar de forma util un trabajo detenido. El resultado actual puede dejar al operador con un navegador dedicado abierto y una demo sin progreso ni una recuperacion efectiva.

El objetivo siguiente es que este flujo opere de fondo de forma resiliente: que detecte una ejecucion no terminada o interrumpida y que su mecanismo de consulta/recuperacion no termine en un estado muerto.

## Lo que ya quedo validado

- Una solicitud publica recibe propuesta de DeepSeek y, al aceptarla, inicia automaticamente el trabajo de demo.
- Una generacion supervisada completo de inicio a fin, produjo assets y rutas, ensamblo el release y lo entrego a Oracle Admin como revision privada.
- Se verificaron dos releases privados reales en Admin: JOYERIA GRECIA (`466d9e17-5d01-4b5b-b672-649887665a71`) y MECANICA "LOS CHAPOS" (`d0ce5598-fdfb-4984-b045-321f2815d1f5`).
- Admin actualiza el estado operativo de los jobs y ofrece la revision privada sin requerir recargar una pestaña que mostraba un estado obsoleto.
- Tras aprobar una demo, la pantalla de espera del cliente final se actualiza con la demo correspondiente.
- La aprobacion/publicacion sigue siendo una compuerta humana; no debe convertirse en un efecto automatico del trabajo de resiliencia.

## Contexto de cierre

La correccion anterior resolvio el caso de pestaña oculta y la entrega supervisada a Admin, pero no certifica la recuperacion sin supervision ante una generacion interrumpida. Este documento prevalece sobre los handoffs historicos que describen como pendiente la entrega a Admin.

Evidencia y cambios del corte anterior: `docs/LMWARES-DEMO-STUDIO-BACKGROUND-TAB-DIAGNOSIS-AND-CORRECTION-PLAN-2026-09-14.md`.
