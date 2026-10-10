# BUG-LOGIN-001 — Transiciones de autenticación

Fecha: 2026-10-08. Rama: `feat/pwa-mobile-navigation`.

Se revisó el video `C:\Users\melvi\Desktop\bug login 001.mp4` (30,17 segundos) y se reprodujeron los fallos con latencia controlada en escritorio y Android. Los cambios anteriores de Mobile First/PWA permanecen en el árbol de trabajo; este informe enumera solamente el trabajo de BUG-LOGIN-001.

## Causa raíz confirmada

1. **Login:** `router.push()` inicia la navegación sin esperar a que termine. El `finally` restablecía `loading` inmediatamente después de confirmar el servidor. El formulario volvía a mostrar «Entrar» mientras todavía esperaba el dashboard, y admitía un segundo envío. La prueba que retiene la navegación reprodujo el botón habilitado en ambos dispositivos.
2. **Dashboard:** cada evento `visibilitychange`, `pageshow` u `online` podía iniciar una consulta independiente a `/api/auth/me` y aplicar `visibility: hidden` al contenedor completo. Esto producía una pantalla vacía durante la verificación. Una respuesta HTTP no exitosa distinta de 401 podía dejarla oculta, porque solo se restablecía el estado en respuestas exitosas o excepciones de red.
3. **Transición inicial y cierre:** el retorno temprano de carga no montaba el bloque `style jsx` que definía su spinner. Además, el logout conservaba el dashboard hasta terminar su petición y después desmontaba la interfaz antes de reemplazar el documento. La nueva transición tiene estilos independientes y retira la información privada al iniciar el cierre.
4. **Cierres concurrentes:** el botón y el hook de inactividad tenían implementaciones independientes de logout, sin exclusión mutua. El vencimiento junto con eventos de reanudación y actividad produjo **cuatro POST de logout** en la reproducción automatizada. Los dobles clics también podían enviar más de uno.

La reproducción previa a la corrección tuvo **8 fallos y 2 pruebas aprobadas** (cinco casos en escritorio y Android). La evidencia está en `test-results/login/baseline-results.json`.

No se confirmó un defecto en la creación/eliminación de cookies ni en la caché del Service Worker como causa del parpadeo. Se comprobaron por separado las cookies reales y la lista de recursos almacenados.

## Corrección

- El login bloquea el envío sincrónicamente con una referencia, mantiene el estado pendiente hasta desmontarse y usa `router.replace('/dashboard')`. Los errores permiten reintentar.
- El dashboard agrupa las revalidaciones en una sola petición en curso. Una sesión confirmada conserva su pantalla mientras se revalida; una respuesta 401 retira el usuario y reemplaza la ruta.
- Las comprobaciones pendientes se cancelan al cerrar sesión. Sus respuestas tardías se ignoran.
- El cierre manual y la inactividad usan el mismo controlador. El contenido privado se desmonta inmediatamente y aparece «Cerrando sesión…». El cierre solo se da por confirmado tras una respuesta exitosa del servidor. Si falla, se ofrece un reintento sin restaurar contenido privado, incluso al recuperar la conexión.
- Se conserva `window.location.replace()` para el logout: reemplaza el historial y descarta el caché de rutas en memoria de Next. El login y la redirección por sesión inválida usan `router.replace()`.
- El temporizador empieza después de confirmar al usuario, conserva los diez minutos establecidos y dispara una sola vez por expiración. La actividad entre pestañas sigue sincronizada.
- Un cierre confirmado avisa a otras pestañas mediante `BroadcastChannel`; estas retiran su contenido y navegan al login sin enviar otro POST.
- Se conserva la política del Service Worker: solamente página offline e iconos públicos; sin páginas privadas, documentos ni respuestas de API en Cache Storage.

## Archivos de este arreglo

| Archivo | Cambio |
|---|---|
| `app/login/page.tsx` | Estado pendiente estable, bloqueo de doble envío y reemplazo del historial. |
| `app/dashboard/layout.tsx` | Verificación única, cancelación de respuestas obsoletas, logout compartido, reintento y sincronización de pestañas. |
| `hooks/useInactivityLogout.ts` | Callback de cierre compartido, habilitación tras autenticar y protección contra disparos duplicados. |
| `src/components/auth/SessionTransition.tsx` | Nuevo estado visual de verificación/cierre/error con estilos propios. |
| `e2e/bug-login-001.spec.ts` | Regresión de doce escenarios en tres proyectos. |
| `playwright.login.config.ts` | Servidor local exclusivo en puerto 3101 y entorno de prueba aislado. |
| `next.config.mjs` | `NEXT_DIST_DIR` opcional para separar los artefactos de QA del servidor existente; por defecto sigue usando `.next`. |
| `tsconfig.json` | Includes de tipos generados por Next en las carpetas aisladas de QA/build. |
| `.gitignore` | Exclusión de `.next-login-qa` y `.next-login-build`. |
| `docs/BUG-LOGIN-001.md` | Este informe. |

Las rutas `app/api/auth/login/route.ts`, `logout/route.ts`, `me/route.ts`, `lib/auth/session.ts` y `public/sw.js` fueron revisadas y no requirieron cambios para este bug.

## Pruebas y resultados

| Validación | Resultado |
|---|---|
| `npx.cmd playwright test --config=playwright.login.config.ts` | **36 aprobadas**: 12 escritorio, 12 Android 360 × 800 y 12 iPhone/WebKit. Ver limitación offline de WebKit abajo. |
| `npx.cmd vitest run` | **342 aprobadas en 35 archivos**, incluyendo autenticación, autorización y lógica financiera existente. |
| `npx.cmd tsc --noEmit` | Aprobado, sin errores. |
| `npm.cmd run build` | Aprobado; compilación de producción y generación de 23 páginas estáticas. Salida aislada en `.next-login-build`. |

Cobertura de Playwright: login bajo latencia; historial Atrás; revalidaciones agrupadas; cierre con doble clic; acceso directo después del cierre; expiración y actividad; respuesta tardía de sesión; errores y reintentos; cierre entre pestañas; cookies HTTP-only reales; permisos de OPERATOR; rechazo por inactividad en el servidor; caché PWA tras logout; envíos de login simultáneos y errores temporales de revalidación.

Los flujos de credenciales usan respuestas simuladas. Las comprobaciones de `/api/auth/me`, `/api/auth/logout` y rechazo RBAC usan endpoints reales con un JWT firmado exclusivamente para el servidor local. La URL de base de datos del servidor de QA apunta a `127.0.0.1:1`; no se necesita ni se modifica una base de datos. No se utilizaron credenciales reales.

Evidencias locales:

- `test-results/login/results.json`: resultados finales y anotaciones.
- `test-results/login/baseline-results.json`: reproducción anterior al arreglo.
- `test-results/login/video-contact-sheet.png`: fotogramas del video proporcionado, conservados localmente fuera de Git.
- `test-results/login/artifacts/*/logout-transition.png`: capturas del cierre sin contenido privado en los tres dispositivos.

## Límite de la validación offline en WebKit

La emulación `context.setOffline(true)` puede fallar en WebKit con `WebKit encountered an internal error` antes de renderizar la respuesta del Service Worker. Coincide con [Playwright #42775](https://github.com/microsoft/playwright/issues/42775). La suite registra una anotación explícita cuando ocurre: **la privacidad y la lista de caché sí se verifican; la página de fallback offline de WebKit no queda validada por esa ejecución**. El fallback se comprobó en Chromium de escritorio y Android. Las pruebas normales de login/logout, cookies, historial y expiración pasaron en WebKit.

Las pruebas con APIs simuladas bloquean el Service Worker para garantizar la interceptación, como indica la [documentación de Playwright](https://playwright.dev/docs/network#missing-network-events-and-service-workers). La prueba PWA lo habilita y usa los endpoints reales de sesión.

No se realizaron pruebas en teléfonos físicos. El build mantiene advertencias existentes de Browserslist desactualizado, `punycode` y el aviso de Prisma sobre su directorio de generación futuro.

## Reproducción de los comandos

```powershell
npx.cmd playwright test --config=playwright.login.config.ts
npx.cmd vitest run
npx.cmd tsc --noEmit

# Build aislado de datos reales y del servidor de desarrollo existente:
$env:NEXT_DIST_DIR = '.next-login-build'
$env:DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/login_test'
$env:JWT_SECRET = 'bug-login-001-local-test-secret-not-a-real-credential'
npm.cmd run build
```

No se modificaron credenciales, esquema de base de datos ni reglas de negocio para este arreglo. No se realizó push ni merge. Commit sugerido: `fix(auth): stabilize login/logout transitions and deduplicate session expiry`.
