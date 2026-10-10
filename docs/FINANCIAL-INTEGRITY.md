# Integridad financiera

Fecha de verificación: 2026-10-10. Rama: `feat/financial-integrity`, base
`origin/main` (`74c61b3`). No se aplicaron cambios a Neon ni se desplegó la aplicación.

## Arquitectura y transacciones

`payment.service.ts` conserva los tipos públicos y las consultas. El registro y la
reversión se implementan en `payment-processing.ts`. Todas las lecturas financieras,
validaciones, pagos, aplicaciones de mora, cuotas, saldos, auditoría y resultados
idempotentes se ejecutan dentro de una transacción interactiva Prisma/PostgreSQL.
Una excepción en cualquier etapa revierte la operación completa.

`financialTransaction()` usa `READ COMMITTED`, espera de conexión de 10 segundos y
timeout de transacción de 15 segundos. `lockLoan()` ejecuta un `SELECT ... FOR UPDATE`
parametrizado antes de leer el préstamo y su calendario. El bloqueo permanece hasta
commit/rollback y es común a pagos con/sin clave, reversiones, cancelaciones,
activaciones, aprobaciones y procesamiento de vencimientos. Una reversión primero
consulta únicamente el identificador inmutable del préstamo, lo bloquea y vuelve
a leer el pago. Las actualizaciones de cuotas verifican el número de filas afectadas.

Los conflictos abortados `P2034`, `40P01` y `40001` permiten como máximo dos
reintentos de la transacción completa, con esperas de 25 y 50 ms. No se reintentan
errores de negocio, restricciones ni conexiones con resultado de commit incierto.
Los timeouts/conflictos reconocidos se exponen como HTTP 503
`FINANCIAL_OPERATION_RETRYABLE`. Con clave se puede recuperar el resultado original;
sin clave se debe consultar el estado antes de reenviar.

La auditoría financiera llama a `tx.auditLog.create()` y propaga errores. El helper
histórico `auditLog()` continúa siendo best effort para operaciones ajenas a este
flujo; no se usa para confirmar pagos o reversiones.

Referencias del protocolo: [transacciones Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)
y [aislamiento PostgreSQL 16](https://www.postgresql.org/docs/16/transaction-iso.html).

## Reglas e invariantes

- Solamente se aceptan pagos en préstamos `ACTIVE` y `OVERDUE`.
- Importes finitos, positivos, con máximo dos decimales y límite de `Decimal(12,2)`.
- Se pagan cuotas completas en orden de número de cuota; el cargo Flat Rate no se
  reduce por anticipos. El tipo efectivo se deriva del número de cuotas cubiertas.
- Se rechazan sobrepagos y sobrantes sin aplicación. No se registra dinero que no
  pueda atribuirse a capital, cargo financiero o mora.
- `totalAmount = capitalApplied + interestApplied + lateFeeApplied`, también para
  movimientos compensatorios negativos.
- `remainingCapital` conserva su significado histórico: **capital más cargo fijo
  de las cuotas pendientes**, no principal puro, y no incluye mora.
- El saldo se obtiene sumando las cuotas reales pendientes; no se calcula como
  número de cuotas multiplicado por cuota nominal. `installmentsPaid` se obtiene
  del cronograma. `PAID` exige que no quede ninguna cuota pendiente.
- El siguiente vencimiento incluye cuotas `PENDING` y `OVERDUE`. Si quedan cuotas
  vencidas, el préstamo permanece `OVERDUE`.
- Antes de operar se comprueban número/orden de cuotas, desglose, sumas de capital,
  cargo fijo, deuda, cantidad pagada y correspondencia con el dinero neto registrado.
  Un historial inconsistente devuelve HTTP 409
  `INVALID_PAYMENT_SCHEDULE`; no se corrige silenciosamente.

Los cálculos contables usan `Prisma.Decimal`. El calendario nuevo redondea la cuota
nominal a centavos y asigna el residual a la última cuota. La distribución acumulada
del principal asegura que cada cuota y las sumas finales cuadren exactamente,
incluidos préstamos sin interés. Se rechazan calendarios que producirían cuotas
cero o negativas.

### Mora y fechas

Se conserva la prioridad confirmada por el usuario: **primero toda la mora pendiente
y después cuotas completas**. El cargo es 5% de la cuota nominal por cuota vencida,
sin capitalización ni recálculo del cargo Flat Rate. Se redondea cada obligación
de mora a dos decimales, HALF_UP, para poder contabilizarla por cuota. Esto explicita
una diferencia de centavos frente al antiguo redondeo agregado cuando el 5% tiene
fracciones de centavo; no se reescriben cobros históricos.

`PaymentLateFeeAllocation` guarda movimientos por pago y cuota. Sus sumas netas
descuentan la mora ya cobrada, aunque la cuota siga pendiente. Ejemplo: tres cuotas
vencidas de RD$300 tienen RD$45 de mora. Un primer pago de RD$345 paga toda esa mora
y una cuota; el siguiente pago de RD$300 no vuelve a cobrar mora. Una reversión
agrega aplicaciones negativas y restaura la obligación correspondiente.

El calendario financiero usa `America/Santo_Domingo`, independiente del TZ del
servidor. La mora corresponde al día de procesamiento. `paymentDate` sigue siendo
la fecha del recibo y de `paidAt`: una fecha anterior no elimina la mora actual.
El contrato conserva fechas de calendario y timestamps ISO con zona explícita.

## Idempotencia persistente

Ambos POST (`/api/payments` y `/api/loans/[id]/payments`) admiten `Idempotency-Key`
opcional, entre 16 y 128 caracteres alfanuméricos, guion o guion bajo. Sin clave
se garantiza integridad concurrente, pero no deduplicación de un reenvío cuando
todavía quedan otras cuotas cobrables.

La clave primaria de `PaymentIdempotency` es `(userId, operation, key)`, donde la
operación es `CREATE_PAYMENT`. El hash SHA-256 incluye préstamo, monto normalizado,
tipo solicitado y fecha explícita (o null). El usuario procede de la sesión, nunca
del cuerpo de la petición. Las dos rutas comparten alcance.

1. Reservar la clave con `INSERT ... ON CONFLICT DO NOTHING` dentro de la transacción.
2. Leer la reserva confirmada; PostgreSQL espera si otra operación tiene la misma clave.
3. Repetición idéntica: devolver el snapshot original, incluso si el préstamo cambió
   o el pago fue revertido después. Se preservan los tipos Date y Decimal del servicio.
4. Mismo alcance/clave con otro contenido: HTTP 409 `IDEMPOTENCY_CONFLICT`.
5. Guardar el resultado en la misma transacción que el pago y la auditoría.

Un fallo revierte también la reserva: la clave puede reintentarse. Una reserva en
curso no se publica parcialmente. Se conservan las claves sin expiración ni tarea
automática de purga para evitar que un reintento tardío vuelva a cobrar.

Se reconoce el formato previo `PAYMENT_IDEMPOTENCY` de `AuditLog`, incluido su
identificador/hash y su bloqueo advisory, y se reconstruye el resultado tipado.
No se eliminan esas claves. La convivencia temporal con escritores de la versión
antigua **no** garantiza integridad: el corte debe reemplazar todos los escritores.

El formulario envía una UUID por contenido de solicitud. Deja de bloquear importes
superiores al saldo sin mora, porque pueden ser pagos válidos con mora. Ante una
respuesta incierta conserva el comportamiento de bloqueo e instrucción de consultar
los pagos. La clave del formulario no sobrevive al cierre/recarga; consumidores que
quieran reintentos automáticos deben conservar la clave y el cuerpo originales.

## Reversiones e historial

Se exige motivo, se bloquea el préstamo y se verifica que el pago original sea
positivo y no tenga reversión. `reversesPaymentId @unique` impide duplicados también
en PostgreSQL. No se revierten préstamos cancelados ni movimientos compensatorios.

Las reversiones siguen orden inverso de cuotas aplicadas: si hay cuotas posteriores
pagadas, deben revertirse primero. Esto evita retirar una aplicación de mora de la
que depende un pago posterior, independientemente de fechas de recibo retroactivas.

Se crea un pago negativo que referencia el original, se agregan movimientos
negativos de mora, se restauran las cuotas y se recalculan saldo y estado desde el
cronograma. La mora reembolsada no aumenta `remainingCapital`. Todo, incluida la
auditoría con motivo e identificador original, confirma o revierte junto.

Triggers rechazan UPDATE/DELETE de `Payment` y `PaymentLateFeeAllocation`. Los
roles con privilegios administrativos pueden desactivar triggers: las garantías
presuponen que las escrituras de aplicación usan estos servicios y no realizan
operaciones administrativas directas.

## Prisma, migraciones y compatibilidad

- `0001_baseline`: normalizada de UTF-16 a UTF-8, sin cambiar su SQL. La versión
  anterior fallaba con `string contains embedded null` en una base vacía.
- `0003_align_existing_schema`: versiona `DRAFT`, días de cobro, aprobación y
  productos, que ya existían en el modelo pero faltaban en el historial. Es aditiva
  y tolera objetos ya provisionados; no sustituye una inspección del esquema real.
- `0004_financial_consistency`: transacción DDL con comprobación previa de cuotas
  duplicadas; tabla de idempotencia, enlace único de reversión, unicidad de
  `(loanId, installmentNumber)`, aplicaciones de mora, FKs, checks e inmutabilidad.
- Se reflejan en Prisma los VARCHAR que ya exigía `0002` para clientes.

Los CHECK de balance/dirección se agregan `NOT VALID`: protegen nuevas escrituras
sin borrar ni modificar negativos o importes descuadrados históricos. Deben
validarse sobre toda la tabla únicamente después de una conciliación explícita.
Las cuotas duplicadas detienen la migración antes de modificar el esquema.

`scripts/financial-preflight.sql` contiene consultas de revisión para una copia
restaurada. La mora histórica sin atribución por cuota bloquea nuevos pagos con
`FINANCIAL_HISTORY_REVIEW_REQUIRED`. Reversiones antiguas sin relación, desglose
inconsistente o calendarios faltantes necesitan conciliación; no se infieren enlaces
ni se altera el dinero registrado.

Antes de un despliegue futuro: respaldar, ejecutar preflight sobre una copia,
comparar esquema e historial `_prisma_migrations`, resolver explícitamente el
checksum del baseline si ya estaba registrado en UTF-16, conciliar los casos
reportados, aplicar las migraciones y reemplazar todos los escritores juntos.
No usar `migrate reset` ni editar checksums de producción automáticamente. Esta
iteración no accedió al contenido de la base Neon ni ejecutó migraciones allí.

## Evidencia y reproducción

Base inicial: **388 pruebas / 35 archivos aprobados** en `origin/main`.
La primera invocación estuvo bloqueada por el sandbox/esbuild; la ejecución con
permisos adecuados produjo esa base. Los mocks anteriores dependían de lecturas
fuera de la transacción y algunos aceptaban sobrantes: se adaptaron a la nueva
arquitectura manteniendo las comprobaciones funcionales.

| Verificación | Resultado |
|---|---|
| `npx prisma validate` | Aprobado |
| `npx prisma generate` | Aprobado; un intento concurrente con tests encontró DLL bloqueada en Windows y se repitió tras terminar los procesos |
| `npx tsc --noEmit` | Aprobado |
| `npx vitest run` | 427 pruebas, 38 archivos aprobados |
| `npm run build` | Aprobado, Next.js 14.2.35 |
| `npm run test:financial` | 39 pruebas PostgreSQL aprobadas |
| Migraciones en esquema vacío | Las cuatro migraciones aplicadas |
| Upgrade con datos históricos | Conserva snapshots de pagos y claves, rechaza nuevas escrituras inválidas |
| `prisma migrate diff` contra PostgreSQL de pruebas | Sin diferencias de modelo |

Los errores Prisma visibles en los logs de integración son fallos deliberados
inyectados por las pruebas. Un primer build detectó el tipo opcional de
`process.disconnect` del worker; se corrigió y el build posterior pasó. No quedan
fallos de pruebas conocidos. No se ejecutó la suite E2E completa de navegador.

| ID | Evidencia automatizada |
|---|---|
| FI-001 | Pago/cuota/saldo/auditoría, sumas Decimal y transición de estado |
| FI-002 | Dos procesos sincronizados pagan la última cuota de RD$1,000: solo uno confirma; sin claves, claves distintas y combinación |
| FI-003 | Seis procesos sincronizados con una clave: un pago y un snapshot persistido |
| FI-004 | Contenido distinto: conflicto PostgreSQL y HTTP 409 en ambas rutas |
| FI-005 | Trigger falla al actualizar cuotas: cero pagos/auditorías/reservas y saldo original |
| FI-006 | Sobrepago y sobrantes rechazados sin modificaciones |
| FI-007 | Tres procesos revierten el mismo pago: una compensación efectiva |
| FI-008 | Trigger de auditoría falla: rollback de pago, reversión o cancelación |

También se prueban mora sin duplicación y su devolución, anticipos, redondeo final,
fechas, claves históricas, usuario/alcance, respuesta perdida, inmutabilidad,
desconexión de PostgreSQL, unicidad de reversión, cancelaciones/aprobaciones
concurrentes y vencimientos contra liquidación. Un deadlock real (`40P01`) fuerza
rollback y reintento: tres intentos para dos transacciones, dos auditorías finales.

El contenedor de esta tarea es `lms-financial-integrity-20261010`, PostgreSQL 16
Alpine, puerto **127.0.0.1:55440**, base `lms_finance_test`. No comparte datos con el
contenedor anterior. Las pruebas rechazan URLs remotas o con otro puerto/base.
El config de integración establece `DATABASE_URL` antes de importar Prisma; la suite
normal excluye integración. El reset de fixtures solo ocurre dentro de esa base
aislada. Los workers son procesos Node independientes liberados mediante una barrera
IPC en los escenarios críticos.

```powershell
$env:FINANCIAL_TEST_DATABASE_URL = 'postgresql://finance_test:finance_test_local@127.0.0.1:55440/lms_finance_test'
$env:DATABASE_URL = $env:FINANCIAL_TEST_DATABASE_URL
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd run test:financial
node scripts/verify-financial-migrations.cjs
npx.cmd vitest run
npx.cmd tsc --noEmit
npm.cmd run build
```

`verify-financial-migrations.cjs` crea y elimina únicamente su esquema temporal
aleatorio dentro del contenedor dedicado. Los logs de ejecución local están en
`test-results/financial-integrity-{baseline,unit,postgres,tsc,build,migrations,history}.txt`
(directorio ignorado por Git). El contenedor se deja disponible para QA.

## Archivos y límites pendientes

Producción: `lib/services/{payment.service,payment-processing,payment-idempotency,
financial-transaction,loan.service}.ts`, `lib/domain/{flatRateCalculator,
financial-calendar}.ts`, ambas rutas POST, `CreatePaymentModal.tsx`, Prisma y las
migraciones descritas. Verificación: configs Vitest, script de worker, script de
migraciones/preflight, suite de integración y fixtures/pruebas unitarias/API.
`package.json` agrega `test:financial`. El cambio local previo en `.gitignore`
se conserva y queda fuera de los commits de esta tarea.

Pendiente del proceso de despliegue, fuera de esta tarea: conciliación de datos reales
y checksum histórico, validación completa de CHECKs y política de archivado de claves.
La zona financiera y el redondeo de mora por cuota quedan explícitos para QA. No se
ha hecho merge, despliegue, ni prueba de carga prolongada; la evidencia acredita
los escenarios automatizados descritos, no escritores externos que evadan el protocolo.

### Inventario exacto de la entrega

Archivos nuevos:

- `docs/FINANCIAL-INTEGRITY.md`
- `lib/domain/financial-calendar.ts`
- `lib/services/financial-transaction.ts`
- `lib/services/payment-idempotency.ts`
- `lib/services/payment-processing.ts`
- `prisma/migrations/0003_align_existing_schema/migration.sql`
- `prisma/migrations/0004_financial_consistency/migration.sql`
- `scripts/financial-preflight.sql`
- `scripts/financial-worker.ts`
- `scripts/verify-financial-migrations.cjs`
- `src/tests/integration/financial.test.ts`
- `src/tests/mocks/financial-fixture.ts`
- `src/tests/mocks/financial-rounding.test.ts`
- `src/tests/mocks/financial-transaction.test.ts`
- `src/tests/mocks/payment-idempotency.test.ts`
- `vitest.financial.config.ts`

Archivos modificados:

- `app/api/loans/[id]/payments/route.ts`
- `app/api/payments/route.ts`
- `lib/domain/flatRateCalculator.ts`
- `lib/services/loan.service.ts`
- `lib/services/payment.service.ts`
- `package.json`
- `prisma/migrations/0001_baseline/migration.sql`
- `prisma/schema.prisma`
- `src/components/payments/CreatePaymentModal.tsx`
- `src/tests/api/payment-contract.test.ts`
- `src/tests/api/payments.test.ts`
- `src/tests/mocks/loan-edge-cases.test.ts`
- `src/tests/mocks/loan-service-coverage.test.ts`
- `src/tests/mocks/loan-status.test.ts`
- `src/tests/mocks/payment-create.test.ts`
- `src/tests/mocks/payment-reversal.test.ts`
- `src/tests/mocks/payment-service-coverage.test.ts`
- `src/tests/mocks/payment-service-flat-rate.test.ts`
- `src/tests/mocks/prisma.mock.ts`
- `vitest.config.ts`
