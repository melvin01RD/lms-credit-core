# Mobile First y PWA

Navegación inferior y menú lateral para móvil; formularios, tarjetas y tablas
adaptados a pantallas pequeñas; acceso telefónico, agenda y descarga de PDF.
El manifiesto incluye iconos normales, maskable y Apple, con instrucciones de
instalación para iOS y el aviso de instalación del navegador cuando esté disponible.

El Service Worker almacena exclusivamente la página offline y cuatro iconos.
No almacena dashboard, API, respuestas RSC, informes ni información privada.
No existe cola offline de pagos. Tras un resultado de pago incierto, el formulario
impide reenviarlo y pide consultar los pagos; los reintentos idempotentes del backend
pertenecen al bloque financiero pendiente.

Validación reproducible: `npx.cmd tsc --noEmit`, `npx.cmd vitest run`,
`npm.cmd run build` y `npm.cmd run test:e2e:mobile`. La suite móvil arranca desarrollo
en localhost:3102 (cookies HTTP de prueba; producción requiere HTTPS), utiliza APIs simuladas y una base local inaccesible para evitar
escrituras reales. Incluye Chrome escritorio, Android de 360/390/430 px y WebKit iPhone,
además de regresiones de sesión, logout, RBAC y caché privada.

La instalación nativa en dispositivos físicos requiere HTTPS y sigue pendiente de
comprobación manual en Android/iOS. La emulación WebKit puede rechazar una navegación
offline antes de ejecutar el Service Worker; cualquier caso así se documenta como
limitación de emulación y no como prueba de funcionamiento del fallback en iPhone.
