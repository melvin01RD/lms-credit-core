# Playwright: autenticación y regresión financiera QA

## Arquitectura

Rama `test/playwright-auth-fixtures`, basada en `feat/financial-integrity` (`f745847`).
Se usó un worktree separado; el cambio local preexistente en `.gitignore` del checkout original no se incluyó.

La aplicación usa `jsonwebtoken`, cookie HTTP-only `lms_session`, JWT de 11 minutos,
inactividad máxima de 10 minutos y renovación deslizante. No usa Better Auth.
`e2e/qa/session.ts` importa `refreshSession` de producción desde Node y consulta únicamente
`qa.admin@lms.local` y `qa.operator@lms.local`, verificando existencia, actividad y rol.
No consulta hashes ni modifica contraseñas. No hay endpoints de bypass ni cambios en middleware.
El secret es aleatorio y efímero por ejecución, compartido exclusivamente entre Playwright y su servidor.
Los casos de expiración firman con el mismo mecanismo y un reloj pasado, restaurado sincrónicamente.

`globalSetup` prepara estados ADMIN/OPERATOR en `playwright/.auth`, excluidos de Git.
El teardown elimina ambos y el setup limpia archivos anteriores y fallos parciales.
Los fixtures `adminPage` y `operatorPage` crean contextos independientes y sesiones nuevas por prueba;
esto evita que estados antiguos expiren durante Playwright UI. Un cierre abrupto del proceso puede
dejar estados en disco hasta el siguiente setup: no compartirlos ni adjuntarlos a reportes.
En Windows, `mode: 0o600` no sustituye los permisos ACL del directorio del usuario.

## Aislamiento

`e2e/qa/environment.cjs` es la única validación centralizada. Requiere protocolo PostgreSQL,
base exacta `lms_credit_qa`, hostname exacto confirmado independientemente con `QA_EXPECTED_HOST`,
host Neon directo (sin pooler), SSL obligatorio y ausencia de conexiones alternativas divergentes.
No deriva el host autorizado de la propia conexión. Rechaza destinos externos y parámetros
de conexión que puedan redirigir la base o esquema. Nunca muestra valores al fallar.

La configuración QA inicia su propio Next en `127.0.0.1:3117`, con `reuseExistingServer: false`,
`DATABASE_URL` y `JWT_SECRET` explícitos y `.next-qa-e2e` independiente. Next da precedencia a
variables del proceso sobre archivos dotenv; Prisma usa `DATABASE_URL` en el schema.
El archivo QA se lee directamente; `.env.test.local` y las credenciales de suites antiguas no se cargan.
Los clientes Prisma de fixtures vuelven a validar antes de conectarse y no registran consultas.
`NODE_ENV=test` evita los logs Prisma de desarrollo en este servidor local; producción no cambia.
Logs del servidor, trazas, capturas y videos están desactivados para evitar cookies/tokens en evidencias.
Los reportes list muestran nombres y resultados de pruebas; no imprimir respuestas o cookies completas.
La configuración general excluye los nuevos specs: requieren explícitamente la configuración QA.

## Ejecución en PowerShell

Requiere dependencias instaladas y Chromium de Playwright. Configure el archivo local ignorado
`.env.qa.local` con `DATABASE_URL` de QA. Defina el host confirmado desde Neon sin pegar credenciales:

```powershell
$env:QA_EXPECTED_HOST = '<hostname directo confirmado de qa-financial-integrity>'
# Opcional: ubicación absoluta de un archivo QA local existente, sin copiarlo al repositorio.
$env:QA_ENV_FILE = '<ruta absoluta al archivo QA>'
npm run typecheck:e2e:qa
npm run test:e2e:qa
npm run test:e2e:qa -- --grep AUTH
npm run test:e2e:qa -- --grep FI-E2E
npm run test:e2e:qa -- --headed
npm run test:e2e:qa:ui
```

Para VS Code, abra este worktree y ejecute Playwright UI desde su terminal con esas variables.
Si usa la extensión Playwright, seleccione `playwright.qa.config.ts` y asegúrese de que el proceso
de VS Code herede las variables. UI y headless usan el mismo setup; no reutilizar estados manuales.
El puerto ocupado provoca un aborto: cierre únicamente el servidor propio de la ejecución anterior.

Variables: `DATABASE_URL` y `QA_EXPECTED_HOST` obligatorias; `QA_ENV_FILE` opcional;
`QA_SESSION_SECRET`, `JWT_SECRET`, `BASE_URL`, `NEXT_DIST_DIR` se preparan internamente.
No configure un secret de producción para esta suite. No registrar ni versionar valores.

## Cobertura y datos

AUTH-001/002: dashboard y backend ADMIN/OPERATOR. AUTH-003: 403 backend en usuarios,
configuración y activación. AUTH-004: 401 y redirección sin sesión. AUTH-005: tokens inválidos,
expirados e inactivos. Son siete casos.

FI-E2E-001/008: pago real desde el modal, saldo, cuotas, actor y auditoría.
FI-E2E-002: sobrepago sin modificación. FI-E2E-003/006: replay HTTP sin duplicados,
reversión compensatoria, suma neta cero y trazabilidad. FI-E2E-007: rechazo después de pago total.
FI-E2E-004/005 y las variantes de estados adicionales se apoyan en
`src/tests/integration/financial.test.ts`; no se simulan deadlocks ni fallos transaccionales en HTTP.

Clientes/documentos son ficticios y únicos. Préstamos se crean por HTTP a través del servicio de dominio.
La limpieza se limita al ID del cliente creado por el fixture. Los triggers del PR #2 prohíben borrar
pagos y asignaciones: el teardown revierte pagos pendientes de reversión, cancela préstamos y
desactiva clientes, preservando historial, auditoría e idempotencia. No deshabilita triggers ni usa TRUNCATE.
`test-results/qa-owned/records.jsonl` contiene exclusivamente IDs sintéticos para seguimiento local.
Estos registros históricos permanecen en QA; una limpieza física requiere una política aparte que
respete la inmutabilidad. Interrumpir un proceso puede impedir compensar: revisar el manifiesto.

## Validaciones de esta implementación

Prisma validate: aprobado, 4.665 s. TypeScript aplicación: aprobado, 8.879 s.
TypeScript E2E: aprobado, 3.701 s en el chequeo final.
Vitest: 437 ejecutadas, 437 aprobadas, 0 fallidas, 0 omitidas; 39 archivos, 4.22 s (proceso 5.515 s).
Build Next.js: aprobado, 46.875 s; primer intento bloqueado por acceso a Google Fonts en sandbox,
reintento fuera del sandbox aprobado. Esbuild también requirió ejecución fuera del sandbox.
Los chequeos offline usan conexión local inaccesible y secrets efímeros con
`node scripts/qa-offline-check.cjs prisma|types|e2e-types|unit|build` (un argumento por comando).

PostgreSQL financiero: bloqueado antes de ejecutar tests por falta de `FINANCIAL_TEST_DATABASE_URL`.
La configuración existente exige `localhost:55440/lms_finance_test` y ejecuta TRUNCATE;
no debe apuntarse a Neon. Las 39 pruebas PostgreSQL previas son contexto del PR #2, no evidencia nueva.

Primer intento completo QA: 11 ejecutadas, 8 aprobadas, 3 fallidas, 0 omitidas, 1.8 minutos.
AUTH: 7/7 aprobadas. Defectos de tests corregidos: aceptar `window.confirm` y respetar triggers
de historial inmutable en teardown. Dos datasets financieros de ese intento quedaron conservados
al rechazar PostgreSQL su borrado; no se intentó eludir la protección ni borrar por prefijos.
La preparación inicialmente se bloqueó por host no confirmado y luego por red restringida;
un reintento con servidor ocupado abortó como estaba previsto.

Ejecución corregida QA: 11 ejecutadas, 11 aprobadas, 0 fallidas, 0 omitidas, 1.0 minuto.
Incluye 7 casos AUTH y 4 financieros y sus teardowns compensatorios. Los estados autenticados
fueron eliminados al terminar. El manifiesto registra creación/preparación/compensación;
el teardown usa un contexto HTTP propio para sobrevivir al cierre del navegador.
Revalidación del teardown final: 4 financieros ejecutados, 4 aprobados, 0 fallidos,
0 omitidos, 53.0 s. UI/headed están configurados pero no se validaron manualmente.
Evidencias locales: logs offline en `test-results/qa-offline/`, manifiesto en
`test-results/qa-owned/records.jsonl` y resultados de consola de Playwright. No adjuntar `.auth`.

## Riesgos y límites

No se modificaron reglas financieras ni autenticación de producción. El endpoint de reversión y
otras rutas existentes aceptan algunos IDs de actor en el cuerpo; los tests usan únicamente el actor
QA real, sin cambiar esos contratos en este PR. Eso merece una revisión de seguridad independiente.
Los helpers antiguos usaban credenciales incrustadas: el helper común ahora exige variables locales.
La inspección detectó referencias preexistentes a contraseñas de prueba en otros helpers, seeds y
documentación; no se puede declarar una auditoría completa de secretos del historial Git.
Los archivos nuevos no incluyen credenciales ni conexiones QA; los estados y evidencias están ignorados.
