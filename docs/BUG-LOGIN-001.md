# BUG-LOGIN-001 — Ciclo de autenticación y sesiones

Commit preparado: `fix(auth): stabilize session lifecycle`.
Base: `c6ce9e5` (`fix(auth): resolve login FOUC during SSR navigation`), en `feat/pwa-mobile-navigation`. El commit de BUG-LOGIN-002 y sus cuatro archivos permanecen intactos.

## Comportamiento corregido

- El login bloquea envíos repetidos con una referencia sincrónica. Mantiene el estado pendiente después de una respuesta exitosa hasta desmontarse y navega con `router.replace('/dashboard')`. Los errores permiten reintentar.
- El layout centraliza el logout manual y por inactividad. Retira inmediatamente el contenido privado, cancela verificaciones pendientes y conserva la transición hasta confirmar el cierre y reemplazar el documento.
- Un fallo de logout muestra un error y permite reintentar. `exiting` se desbloquea para el nuevo intento; `logoutRequested` permanece activo para impedir que una revalidación restaure el dashboard. El temporizador está deshabilitado porque ya no hay un usuario confirmado.
- La verificación de sesión comparte una única petición en curso, ignora respuestas canceladas y reemplaza la ruta ante un 401. Una revalidación transitoria fallida no elimina una pantalla cuya sesión ya estaba confirmada.
- `BroadcastChannel` sincroniza la actividad y los cierres entre pestañas. Una pestaña que recibe un cierre no repite el POST.
- `SessionTransition` presenta verificación, cierre y reintento con estilos propios, independientes de los estilos condicionales del dashboard.
- Los wrappers de autenticación y roles impiden caché compartida mediante `Cache-Control: private, no-store, max-age=0`. La configuración añade esa política a API, dashboard y login.

No se modifican JWT, cookies, RBAC, contraseñas, Prisma, bases de datos ni reglas de negocio. No se introducen retrasos artificiales.

## Archivos y dependencias del conjunto preparado

| Archivo | Fragmento incluido |
|---|---|
| `app/login/page.tsx` | Referencia contra doble envío, estado pendiente, reemplazo del historial y estado accesible del botón. Sin los atributos móviles/autocompletado pendientes. |
| `app/dashboard/layout.tsx` | Imports, estados/referencias de sesión, controlador de logout, verificaciones/eventos, transición y callback del botón. |
| `hooks/useInactivityLogout.ts` | Callback compartido, habilitación tras autenticar, vencimiento único y limpieza del temporizador/eventos/canal. |
| `src/components/auth/SessionTransition.tsx` | Pantalla de transición y reintento. |
| `lib/api/auth-middleware.ts` | Cabecera no-store en respuestas autenticadas del handler. |
| `lib/api/role-middleware.ts` | La misma cabecera para handlers autorizados por rol. |
| `lib/services/user.service.ts` | Solo `NonNullable` en `SafeUser`: corrige el tipo del usuario saneado, sin cambiar comportamiento. |
| `e2e/bug-login-001.spec.ts` | Doce escenarios de sesión, sin dependencia de Service Worker ni páginas de negocio. |
| `src/tests/api/auth-cache.test.ts` | Dos comprobaciones de no-store y conservación de la cookie renovada en ambos wrappers. |
| `playwright.login.config.ts` | Servidor local aislado, JWT exclusivo de pruebas y tres proyectos de navegador. |
| `next.config.mjs` | Directorio opcional de build y cabeceras de autenticación. Sin configuración del Service Worker ni de aprobación. |
| `.gitignore` | Ignora los dos directorios de build de autenticación. |
| `tsconfig.json` | Incluye los tipos generados en dichos directorios. No se excluyeron pruebas ni se relajó la comprobación de tipos. |
| `docs/BUG-LOGIN-001.md` | Este informe de la selección aislada. |

El hook tiene un único consumidor: `app/dashboard/layout.tsx`. Ambos cambios deben confirmarse juntos. Su efecto depende de `enabled`; una referencia conserva el callback actualizado sin reiniciar el temporizador por cada renderizado. Se mantiene el plazo existente de diez minutos.

El ajuste `NonNullable` elimina siete diagnósticos adicionales en pruebas de autenticación y gestión de usuarios. Se comparó el chequeo de tipos con y sin ese ajuste en la copia aislada.

El commit previo de BUG-LOGIN-002 importa `playwright.login.config.ts` desde su configuración de pruebas. Este conjunto añade esa dependencia y el soporte de `NEXT_DIST_DIR`, sin modificar BUG-LOGIN-002.

## Separación de Mobile First y PWA

Quedan fuera: navegación inferior, encabezado móvil, cierre del menú al cambiar de ruta, CSS responsive, áreas seguras, provider PWA, manifiesto, Service Worker, iconos y modificaciones de clientes, préstamos, pagos y agenda.

La prueba de historial usa `/login?history=anchor`, no `/offline.html`. La prueba con Service Worker permanece íntegra en el árbol de trabajo principal, sin preparar. Se añadió una prueba de historial y cookie real sin Service Worker para conservar cobertura de autenticación independiente.

Las pruebas de ciclo de sesión usan `/dashboard/unauthorized`, una página existente bajo el layout protegido que no consulta datos de negocio. La primera ejecución sobre clientes encontró tres timeouts de clic en Android: `sidebar-nav` interceptaba el botón de logout sin los cambios responsive pendientes. Esa dependencia de la interfaz de clientes queda fuera de este commit; no se forzaron clics ni se añadieron estilos para ocultarla.

## Validación aislada

Se creó un worktree separado en `../auth-session-review`, partiendo de `c6ce9e5`, y se aplicaron únicamente los archivos/fragmentos candidatos. No se copiaron cambios pendientes de Mobile First o PWA. Las dependencias de Node son una copia independiente para no compartir DLL con el servidor principal.

| Comprobación | Resultado |
|---|---|
| `npx.cmd playwright test --config=playwright.login.config.ts` | **36 aprobadas**, 0 fallos, 0 omitidas y 0 flaky: 12 escritorio, 12 Android y 12 iPhone/WebKit. |
| Vitest: auth-cache, auth-middleware, role-middleware y user-auth | **25 aprobadas**, 4 archivos. |
| `npm.cmd run build` | **Aprobado**, 22 páginas estáticas generadas. |
| `npx.cmd tsc --noEmit` | **Bloqueado por 14 errores heredados** en fixtures de tres archivos excluidos. |
| Codificación | UTF-8 válida, sin caracteres de sustitución ni patrones de texto mal decodificado en los archivos preparados. CRLF/LF no representa corrupción de texto. |

El servidor y el build usan un JWT exclusivo de QA y `DATABASE_URL=postgresql://test:test@127.0.0.1:1/login_test`. Los flujos de credenciales están simulados; cookie, expiración, `/me`, `/logout` y rechazo de permisos se comprueban también con endpoints reales locales. No se ejecutaron pruebas sobre producción.

Cobertura: bloqueo del login durante navegación; coalescencia de verificaciones; doble clic de logout; 401 y expiración; respuestas tardías; fallos y reintento; sincronización de pestañas; cookies/RBAC reales; historial tras logout; envíos rápidos y errores temporales de revalidación.

## Bloqueo de tipos pendiente

Los archivos siguientes son idénticos a HEAD en el worktree de verificación y no se preparan:

- `src/tests/api/clients.test.ts`: 6 errores por fixtures sin `collectionDays`.
- `src/tests/api/loans.test.ts`: 6 errores por fixtures incompletos, incluidos campos de aprobación y relaciones.
- `src/tests/api/payments.test.ts`: 2 errores por la relación `createdBy` y cantidades `number` donde corresponde `Decimal`.

Las correcciones locales de esos archivos permanecen fuera del índice por el alcance solicitado. El build de Next pasa porque su comprobador omite diagnósticos de archivos `*.test.*`; el comando `tsc --noEmit` sí los informa. No se activó `ignoreBuildErrors` ni se modificó la configuración para ocultar errores.

La selección funciona para los escenarios de autenticación y compila como aplicación independiente de PWA, pero **no se declara completamente verde** mientras permanezca este bloqueo global de TypeScript. Los problemas responsive de clientes y la validación en teléfonos físicos también quedan fuera del alcance.

Los resultados de Playwright están en `../auth-session-review/test-results/login/results.json`; el diagnóstico de tipos, comparación de `SafeUser` y evidencia inicial se conservan en `test-results/auth-staging/` del árbol principal. El staging selectivo se revisa con `git diff --cached`, dado que los archivos mixtos mantienen modificaciones adicionales sin preparar.

No se ejecutó commit, push ni merge.
