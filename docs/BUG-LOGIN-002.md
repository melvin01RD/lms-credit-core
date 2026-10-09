# BUG-LOGIN-002 — Login sin estilos durante la transición

Fecha: 2026-10-09. Rama: `feat/pwa-mobile-navigation`.

## Causa raíz confirmada

Se examinó `C:\Users\melvi\Desktop\bug login 002.mp4` (16,17 segundos). La secuencia es login, dashboard, desplazamiento hacia abajo y logout. Entre aproximadamente 13,7 y 13,9 segundos aparece el formulario de login sin estilos sobre un fondo oscuro, antes de recuperar su diseño.

El HTML inicial de `/login` no incluía los estilos de su bloque `style jsx`: faltaba un registro de estilos para el renderizado del servidor. El cierre correcto con `window.location.replace('/login')` solicitaba un documento nuevo y exponía esa carencia hasta que JavaScript hidrataba la página. El fondo oscuro provenía de la preferencia de color aplicada por los estilos globales.

La reproducción confirmó el mismo formulario sin estilos en escritorio, Android y iPhone/WebKit. Se comprobaron tanto la carga sin JavaScript como la secuencia login → dashboard → scroll → logout reteniendo la hidratación del documento de destino. Antes del arreglo, las **seis comprobaciones fallaron**: `.login-container` tenía `display: block` en lugar de `flex`. Las capturas coinciden con el defecto del video.

El registro y la inserción de estilos antes del contenido siguen el mecanismo documentado para [styled-jsx en el App Router de Next.js 14](https://nextjs.org/docs/14/app/building-your-application/styling/css-in-js#styled-jsx).

## Cambio aislado

Solo se añadió un archivo de aplicación: `app/login/layout.tsx` (19 líneas).

- Línea 10: crea una instancia estable del registro de estilos.
- Líneas 12–15: `useServerInsertedHTML` incorpora los estilos recogidos al HTML del servidor y vacía el registro después de insertarlos.
- Línea 18: limita el registro al árbol de `/login`.

No se añadieron temporizadores, retrasos, redirecciones ni nuevas funcionalidades. Se conservaron los cambios locales previos y los controladores de autenticación existentes.

Los otros archivos añadidos para este FIX son:

| Archivo | Propósito |
|---|---|
| `e2e/bug-login-002.spec.ts` | Registro de solicitudes desde la línea 15; estilos SSR en la 68; TC-LOGIN-001 a 006 en las líneas 76, 83, 103, 116, 137 y 157; error de red/reintento en la 198. |
| `playwright.login-002.config.ts` | Servidor y credenciales de prueba aislados; modos de desarrollo y producción; evidencias separadas. |
| `docs/BUG-LOGIN-002.md` | Este informe. |

Se revisaron `app/login/page.tsx`, `app/dashboard/layout.tsx`, `hooks/useInactivityLogout.ts`, `app/api/auth/logout/route.ts` y `lib/auth/session.ts`. No necesitaron modificaciones adicionales para este defecto.

## Investigación de autenticación

- Se registraron método, ruta, tiempos, respuesta y fallo de transporte de `/api/auth/login`, `/api/auth/logout` y `/api/auth/me`, junto con los eventos de navegación. Los registros no incluyen contraseñas ni valores de cookies.
- Cada acción envió un solo POST de login o logout. En la prueba de cinco ciclos hubo **5 login y 5 logout** por dispositivo.
- En desarrollo se observaron dos intentos de `/me` por montaje: el primero se canceló al limpiar el efecto y el segundo confirmó la sesión. Esto corresponde al doble montaje de React en desarrollo; no se confirmó como causa del defecto visual. Las revalidaciones simultáneas y las respuestas tardías están cubiertas además por la suite anterior.
- El contenido privado permaneció retirado durante el cierre pendiente y tras el cierre confirmado. Un error de red mantuvo una pantalla de error con reintento, sin restaurar el dashboard.
- Se verificó un único logout pese al doble clic, al avance del reloj de inactividad y a eventos de reanudación. El temporizador conservó su comportamiento y no compitió con el cierre manual.
- El botón de login permaneció ocupado durante la petición y la navegación. Se conservaron `router.replace()` en login y sesión inválida, y el reemplazo de documento en logout para descartar la caché de rutas del cliente. No se añadieron `push`, `refresh` ni efectos de redirección.
- Con los endpoints locales reales se comprobó que el logout elimina `lms_session` y que `/me` responde 401 después. La suite anterior volvió a comprobar JWT, expiración, RBAC, otras pestañas y caché PWA.

## Resultados

| Validación | Resultado |
|---|---|
| Reproducción previa del defecto visual | 6 fallos confirmados, escritorio/Android/iPhone. |
| TC-LOGIN-001: login | Aprobado en los tres dispositivos emulados. |
| TC-LOGIN-002: logout y secuencia del video | Aprobado en los tres; destino con estilos antes de hidratarse. |
| TC-LOGIN-003: cinco ciclos consecutivos | Aprobado en los tres; 15 ciclos en total. |
| TC-LOGIN-004: Atrás y acceso directo tras logout | Aprobado en los tres, sin contenido privado. |
| TC-LOGIN-005: cierre manual e inactividad | Aprobado en los tres, un solo POST por acción. |
| TC-LOGIN-006: latencia | Aprobado en los tres; estados pendientes conservados hasta salir del documento. |
| Suite BUG-LOGIN-002 completa | **24 aprobadas**, 0 fallos, 0 omitidas, 0 flaky. |
| Regresión anterior de autenticación/PWA | **36 aprobadas**; limitación de WebKit offline indicada abajo. |
| Estilos SSR del build de producción | **3 aprobadas**, con JavaScript deshabilitado. |
| Vitest | **342 aprobadas en 35 archivos**. |
| `npx.cmd tsc --noEmit` | Aprobado. |
| `npm.cmd run build` | Aprobado, 23 páginas estáticas generadas. |

El primer intento de build encontró la DLL de Prisma ocupada por el servidor de desarrollo. Tras detener brevemente ese servidor, el comando completo terminó correctamente; el servidor quedó restaurado y listo en `localhost:3000`. No se modificaron esquema, migraciones ni configuración de Prisma. El build conserva las advertencias previas de Browserslist y del directorio de generación de Prisma.

## Evidencia y reproducción

Los artefactos locales están excluidos de Git:

- `test-results/login-002/baseline-results.json` y `baseline-artifacts/`: fallos y capturas anteriores al arreglo.
- `test-results/login-002/results.json` y `artifacts/`: resultados finales, capturas del login antes de la hidratación y adjuntos `auth-network.json` por prueba.
- `test-results/login-002/production/results.json`: comprobación del build de producción.
- `test-results/login/results.json`: regresión de autenticación/PWA.
- `test-results/login-002/video-contact-sheet.png`, `video-8.png` y `video-12.4.png`: fotogramas del video original.

```powershell
npx.cmd playwright test --config=playwright.login-002.config.ts
npx.cmd playwright test --config=playwright.login.config.ts
npx.cmd vitest run
npx.cmd tsc --noEmit

# Build aislado; no requiere una base de datos disponible.
$env:NEXT_DIST_DIR = '.next-login-build'
$env:DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/login_test'
$env:JWT_SECRET = 'bug-login-001-local-test-secret-not-a-real-credential'
npm.cmd run build
$env:LOGIN_QA_PRODUCTION = '1'
npx.cmd playwright test --config=playwright.login-002.config.ts --grep 'SSR styling'
```

## Alcance de la confirmación y riesgos

**El defecto visual reproducido no vuelve a aparecer en las comprobaciones de escritorio, Android e iPhone emulados.** También se verifica el diseño inicial en el build de producción sin depender de JavaScript.

Los flujos de login usan credenciales y respuestas simuladas; `/me` y `/logout` se prueban contra endpoints reales del servidor aislado con un JWT exclusivo de QA. No se ejercitó la validación de contraseñas contra Neon ni se realizaron pruebas en teléfonos físicos.

La suite PWA verifica que no se almacenen páginas privadas. En WebKit, la navegación con red desconectada puede fallar antes de ejecutar el Service Worker; esa ejecución registra la [limitación de Playwright #42775](https://github.com/microsoft/playwright/issues/42775). La privacidad de la caché se comprobó, pero no se afirma que el fallback offline de iPhone haya quedado validado.

El riesgo de regresión se concentra en el montaje y desmontaje de estilos del login. Los cinco ciclos por dispositivo y la prueba sin hidratación cubren ese comportamiento. El cambio no altera JWT, RBAC, sesiones, contraseñas, clientes, préstamos, pagos ni bases de datos. No se hizo commit, push ni merge.
