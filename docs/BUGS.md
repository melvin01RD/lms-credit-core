# Bugs Pendientes — LMS-Credit-Core

> Inventario reconstruido el 2026-04-17. BUG-001 y BUG-002 preexistentes (no incluidos aquí).
> Auditoría cubre: i18n · Responsive · Validaciones.

---

## Categoría: i18n — Labels de status en inglés

---

## BUG-003: STATUS_LABELS incompleto — falta clave DRAFT

- **Categoría**: i18n
- **Archivos afectados**:
  - `app/dashboard/prestamos/page.tsx` — líneas 71-76
  - `app/dashboard/pagos/page.tsx` — líneas 66-70
  - `lib/services/reports.service.ts` — líneas 307-312 (`calculatePortfolioDistribution`)
- **Descripción**: El diccionario `STATUS_LABELS` en las páginas de préstamos y pagos define solo `ACTIVE`, `OVERDUE`, `PAID`, `CANCELED`. La clave `DRAFT` no está. El fallback `?? loan.status` devuelve la cadena cruda `"DRAFT"` en inglés. En `reports.service.ts` el mismo mapa omite `DRAFT`, por lo que los préstamos en borrador no aparecen en la distribución de cartera.
- **Reproducción**:
  1. Crear un préstamo (queda en estado DRAFT).
  2. Ir a `/dashboard/prestamos` → la columna Estado muestra `DRAFT` en lugar de `Borrador`.
  3. Revisar el widget de distribución de cartera → DRAFT no aparece en el gráfico.
- **Severidad**: Alta
- **Fix sugerido**: Agregar `DRAFT: "Borrador"` a todos los mapas `STATUS_LABELS` y al objeto `statusLabels` de `reports.service.ts`.

---

## BUG-004: loan.status renderizado sin traducir en `/clientes/[id]`

- **Categoría**: i18n
- **Archivos afectados**:
  - `app/dashboard/clientes/[id]/page.tsx` — línea 225
- **Descripción**: El badge de estado en la tabla de préstamos del detalle de cliente renderiza `{loan.status}` directamente, sin pasar por ningún mapa de traducción. Muestra `ACTIVE`, `OVERDUE`, `PAID`, `CANCELED`, `DRAFT` en inglés, aunque el resto de la app use etiquetas en español.
- **Reproducción**:
  1. Ir a `/dashboard/clientes/{id}`.
  2. La columna **Estado** en la tabla de préstamos del cliente muestra valores en inglés.
- **Severidad**: Alta
- **Fix sugerido**: Definir un `STATUS_LABELS` local (o importar uno compartido) y sustituir `{loan.status}` por `{STATUS_LABELS[loan.status] ?? loan.status}`.

---

## BUG-005: Tipo de pago ADVANCE sin traducción

- **Categoría**: i18n
- **Archivos afectados**:
  - `app/dashboard/pagos/page.tsx` — líneas 60-70 (`TYPE_LABELS`)
  - `app/dashboard/prestamos/[id]/page.tsx` — líneas 110-114 (`PAYMENT_TYPE_LABELS`)
  - `app/dashboard/reportes/recibo-pago/page.tsx` — líneas 39-43
- **Descripción**: El enum `PaymentType` de Prisma incluye `ADVANCE`, pero los mapas `TYPE_LABELS` / `PAYMENT_TYPE_LABELS` solo contienen `REGULAR`, `CAPITAL_PAYMENT`, `FULL_SETTLEMENT`. Si se registra un pago de tipo `ADVANCE` la UI muestra `"ADVANCE"` en crudo.
- **Reproducción**:
  1. Crear un pago de tipo `ADVANCE` via la API o servicio.
  2. Revisar `/dashboard/pagos` → columna Tipo muestra `ADVANCE`.
  3. Revisar el recibo de pago → mismo problema.
- **Severidad**: Media
- **Fix sugerido**: Agregar `ADVANCE: "Adelanto"` (o la etiqueta de negocio acordada) en los tres mapas afectados.

---

## BUG-014: Lógica de estado hardcodeada en Agenda — solo maneja OVERDUE

- **Categoría**: i18n
- **Archivos afectados**:
  - `app/dashboard/agenda/page.tsx` — línea 177
- **Descripción**: La expresión `loan.status === "OVERDUE" ? "En mora" : "Al día"` solo distingue dos estados. Si un préstamo en Agenda tiene estado DRAFT, PAID o CANCELED, mostrará "Al día" incorrectamente en lugar de la etiqueta real.
- **Reproducción**:
  1. Abrir `/dashboard/agenda` con un préstamo en estado PAID o DRAFT visible en la vista.
  2. La columna Estado muestra "Al día" en lugar del estado correcto.
- **Severidad**: Media
- **Fix sugerido**: Reemplazar el ternario por el mapa STATUS_LABELS compartido:
  ```tsx
  {STATUS_LABELS[loan.status] ?? loan.status}
  ```

---

## Categoría: Responsive — Layout de tablas en móvil/tablet

---

## BUG-006: Tabla de agenda sin overflow horizontal — contenido aplastado en móvil

- **Categoría**: Responsive
- **Archivos afectados**:
  - `app/dashboard/agenda/page.tsx` — líneas 153-186 (tabla), línea 277 (CSS `.client-card`)
- **Descripción**: El contenedor `.client-card` tiene `overflow: hidden`, que recorta el contenido pero no permite scroll horizontal. La tabla de 6 columnas (Préstamo, Frecuencia, Cuota, Pendiente, Estado, Cobrador) no tiene `min-width` ni wrapper con `overflow-x: auto`. En pantallas < 768 px las columnas se comprimen hasta volverse ilegibles o se cortan.
- **Reproducción**:
  1. Abrir `/dashboard/agenda` en un dispositivo móvil o DevTools a 375 px.
  2. Las filas de la tabla interna de cada cliente aparecen aplastadas o truncadas.
- **Severidad**: Alta
- **Fix sugerido**:
  ```css
  /* Cambiar en .client-card */
  overflow-x: auto;   /* en lugar de overflow: hidden */
  ```
  Y añadir `min-width: 650px` a `.loans-table` para que el scroll sea útil.

---

## BUG-007: `overflow: hidden` en detalle de cliente corta tabla de préstamos en móvil

- **Categoría**: Responsive
- **Archivos afectados**:
  - `app/dashboard/clientes/[id]/page.tsx` — líneas 371-377 (CSS `.table-container`)
- **Descripción**: El `.table-container` usa `overflow: hidden`, lo que corta el contenido horizontal sin ofrecer scroll. La tabla tiene 8 columnas (Monto, Tasa, Frecuencia, Cuota, Pendiente, Estado, Fecha, Acción). En móvil (< 768 px) el contenido queda cortado sin forma de verlo.
- **Reproducción**:
  1. Abrir `/dashboard/clientes/{id}` a 375 px.
  2. La tabla de préstamos del cliente corta columnas sin scroll.
- **Severidad**: Alta
- **Fix sugerido**: Cambiar `overflow: hidden` → `overflow-x: auto` en `.table-container` y agregar `min-width: 700px` a la tabla.

---

## BUG-015: Tablas de préstamos y pagos con `min-width` fijo sin media queries

- **Categoría**: Responsive
- **Archivos afectados**:
  - `app/dashboard/prestamos/page.tsx` — CSS `.table` (`min-width: 800px`)
  - `app/dashboard/pagos/page.tsx` — CSS `.table` (`min-width: 900px`)
- **Descripción**: Ambas tablas tienen `overflow-x: auto` (correcto), pero el `min-width` fijo no tiene media queries. En un teléfono de 375 px el scroll horizontal abarca más del doble del ancho visible, lo que hace la navegación muy incómoda. La tabla de pagos con 900 px es especialmente difícil de usar en móvil.
- **Reproducción**:
  1. Abrir `/dashboard/prestamos` o `/dashboard/pagos` en DevTools a 375 px.
  2. Se requiere scroll horizontal extenso para ver todas las columnas.
- **Severidad**: Media
- **Fix sugerido**:
  ```css
  @media (max-width: 768px) {
    .table { min-width: 100%; }
  }
  ```
  O considerar ocultar columnas secundarias en móvil con clases `hidden sm:table-cell`.

---

## Categoría: Validaciones — Edge cases en formularios y endpoints

---

## BUG-008: Sin límite superior en termCount — workaround Wanda (termCount=999)

- **Categoría**: Validaciones
- **Archivos afectados**:
  - `lib/domain/flatRateCalculator.ts` — líneas 88, 91-93, 120-141
  - `app/api/loans/route.ts` — POST handler
- **Descripción**: El validador solo comprueba `termCount <= 0`. No existe cota superior. Un `termCount=999` (workaround conocido como "Wanda") genera 999 entradas en el plan de pagos, distorsiona los montos de cuota y puede degradar el rendimiento. Un `termCount=999999` podría causar un timeout de Prisma o agotar memoria.
- **Reproducción**:
  1. Crear préstamo con `termCount: 999`.
  2. El plan de pagos se genera con 999 cuotas; la cuota calculada es casi cero.
- **Severidad**: Alta
- **Fix sugerido**:
  ```typescript
  // flatRateCalculator.ts
  if (termCount <= 0 || termCount > 360) {
    throw new Error("El número de cuotas debe estar entre 1 y 360");
  }
  ```
  Documentar aparte el workaround Wanda si necesita mantenerse como excepción controlada.

---

## BUG-009: Validación de teléfono y cédula bypasseable vía API PUT `/clientes/[id]`

- **Categoría**: Validaciones
- **Archivos afectados**:
  - `app/api/clients/[id]/route.ts` — PUT handler (sin validación antes de `updateClient`)
  - `src/components/clients/EditClientModal.tsx` — líneas 153-161 (solo validación HTML5 `pattern`)
- **Descripción**: El formulario de edición de cliente usa `pattern="\d{10}"` y `maxLength={10}`, pero estas son restricciones HTML5 del navegador, fácilmente eludibles con una llamada directa a la API. El endpoint PUT pasa el body sin parsear a `updateClient()` sin validar formato de teléfono ni cédula. Un atacante puede guardar `phone: "ABC123"` o `documentId: "12345"` en la base de datos.
- **Reproducción**:
  1. Enviar `PUT /api/clients/{id}` con `{ "phone": "NOVALIDO" }` usando curl o Postman.
  2. El campo se guarda en DB sin error.
- **Severidad**: Alta
- **Fix sugerido**: Agregar validación Zod en el PUT handler antes de llamar al servicio:
  ```typescript
  const schema = z.object({
    phone: z.string().regex(/^\d{10}$/, "Teléfono debe tener 10 dígitos"),
    documentId: z.string().regex(/^\d{11}$/, "Cédula debe tener 11 dígitos"),
    // ... resto de campos
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  ```

---

## BUG-010: Endpoint POST `/api/loans` sin validación de input — no hay Zod parse

- **Categoría**: Validaciones
- **Archivos afectados**:
  - `app/api/loans/route.ts` — POST handler, líneas 29-41
- **Descripción**: El handler lee `req.json()` y llama directamente a `createLoan({ ...body })` con solo una comprobación de `totalFinanceCharge == null`. No valida tipo, rango ni formato de `principalAmount`, `termCount`, `paymentFrequency` ni `totalFinanceCharge`. Si la capa de servicio lanza una excepción genérica, el mensaje de error expone detalles internos.
- **Reproducción**:
  1. `POST /api/loans` con `{ "principalAmount": -5000, "termCount": "abc", "totalFinanceCharge": 0 }`.
  2. Llega al servicio y falla con stack trace en lugar de un 400 descriptivo.
- **Severidad**: Media
- **Fix sugerido**: Definir un `createLoanSchema` con Zod y usar `.safeParse(body)` al inicio del handler, devolviendo 400 con errores estructurados antes de llamar al servicio.

---

## BUG-011: Acumulación de error de redondeo en cálculo de cuotas (flat rate)

- **Categoría**: Validaciones / Cálculo financiero
- **Archivos afectados**:
  - `lib/domain/flatRateCalculator.ts` — líneas 91-94
- **Descripción**: Las cuotas se calculan con `Math.round(value * 100) / 100`. En montos que no dividen exactamente (ej. RD$103 ÷ 3 = 34.333…), la multiplicación de la cuota redondeada × número de cuotas no coincide con el total. El diferencial acumula centavo a centavo y el préstamo nunca cierra exactamente con la suma de cuotas.

  Ejemplo concreto:
  - Principal RD$100 + cargo RD$3 = RD$103, 3 cuotas.
  - Cuota redondeada: RD$34.33 × 3 = **RD$102.99** ≠ RD$103.00.
  - Diferencia: RD$0.01 que queda sin cubrir.
- **Reproducción**: Crear préstamo con `principalAmount: 100, totalFinanceCharge: 3, termCount: 3` y verificar que la suma del plan de pagos no sea exactamente 103.
- **Severidad**: Media
- **Fix sugerido**: Asignar el residuo de redondeo a la última cuota:
  ```typescript
  const base = Math.round((totalPayableAmount / termCount) * 100) / 100;
  const lastInstallment = totalPayableAmount - base * (termCount - 1);
  ```
  O usar `Decimal.js` (ya importado en el proyecto) de forma consistente.

---

## BUG-012: `totalFinanceCharge` sin cota superior en `/api/loans` y `/api/files`

- **Categoría**: Validaciones
- **Archivos afectados**:
  - `app/api/loans/route.ts` — POST handler
  - `app/api/files/route.ts` — línea ~54
- **Descripción**: La validación de `totalFinanceCharge` solo comprueba `>= 0`. No existe cota superior. Un cargo financiero de RD$999,999,999 en un préstamo de RD$1,000 es técnicamente aceptado, generando cuotas imposibles de pagar y distorsionando los reportes de cartera.
- **Reproducción**:
  1. `POST /api/loans` con `{ "principalAmount": 1000, "totalFinanceCharge": 999999999, "termCount": 12 }`.
  2. El préstamo se crea sin error; las cuotas superan 83 millones de pesos.
- **Severidad**: Alta
- **Fix sugerido**: Agregar validación de cota superior (ej. `totalFinanceCharge <= principalAmount` o un máximo absoluto razonable) tanto en el API handler como en `flatRateCalculator.ts`.

---

## BUG-013: `POST /api/clients` sin schema Zod — body arbitrario llega al servicio

- **Categoría**: Validaciones
- **Archivos afectados**:
  - `app/api/clients/route.ts` — POST handler, líneas 27-35
- **Descripción**: El handler lee `req.json()` y llama directamente a `createClient(data)` sin ningún schema de validación. Aunque el servicio valida cédula y algunos campos, un campo inesperado o mal tipado puede causar un error 500 con stack trace expuesto, o pasar silenciosamente si el servicio no lo cubre.
- **Reproducción**:
  1. `POST /api/clients` con `{ "firstName": "", "documentId": null, "extraField": "x" }`.
  2. El error llega al servicio en lugar de ser rechazado con 400 antes.
- **Severidad**: Alta
- **Fix sugerido**: Agregar un `createClientSchema` Zod con `.safeParse(body)` al inicio del handler, igual al patrón recomendado en BUG-009.

---

## Deuda técnica — fuera de inventario activo

| ID | Descripción | Archivo | Nota |
|----|-------------|---------|------|
| CAND-001 | `pdf-report.service.ts` pasa `loan.status` crudo al PDF | `lib/services/pdf-report.service.ts` líneas 201, 243 | No es bug hoy, status no se renderiza actualmente en PDF. Revisar si se agrega rendering de status en el futuro. |

---

## Resumen ejecutivo

### Totales por categoría

| Categoría | Bugs confirmados | Deuda técnica | Total |
|-----------|-----------------|---------------|-------|
| i18n | 4 (BUG-003, 004, 005, 014) | — | 4 |
| Responsive | 3 (BUG-006, 007, 015) | — | 3 |
| Validaciones | 6 (BUG-008, 009, 010, 011, 012, 013) | — | 6 |
| Deuda técnica | — | 1 (CAND-001) | 1 |
| **Total** | **13** | **1** | **14** |

### Severidad por bug confirmado

| Bug | Título corto | Severidad |
|-----|-------------|-----------|
| BUG-003 | STATUS_LABELS sin DRAFT | Alta |
| BUG-004 | loan.status sin traducir en clientes/[id] | Alta |
| BUG-005 | ADVANCE sin traducción | Media |
| BUG-006 | Agenda tabla sin overflow-x | Alta |
| BUG-007 | Clientes [id] overflow:hidden corta tabla | Alta |
| BUG-008 | termCount sin límite superior (Wanda) | Alta |
| BUG-009 | Validación teléfono/cédula bypasseable vía API PUT | Alta |
| BUG-010 | POST /api/loans sin Zod parse | Media |
| BUG-011 | Acumulación redondeo en cuotas flat rate | Media |
| BUG-012 | totalFinanceCharge sin cota superior | Alta |
| BUG-013 | POST /api/clients sin schema Zod | Alta |
| BUG-014 | Estado hardcodeado en Agenda (solo OVERDUE) | Media |
| BUG-015 | Tablas con min-width fijo sin media queries | Media |

### Orden recomendado de resolución

```
Sesión 1 — Validaciones en endpoints de clients
  BUG-009  Validación teléfono/cédula bypasseable vía API PUT
  BUG-013  POST /api/clients sin schema Zod

Sesión 2 — Validaciones de loans (cotas superiores)
  BUG-008  termCount sin límite superior (Wanda workaround)
  BUG-012  totalFinanceCharge sin cota superior

Sesión 3 — Grupo i18n completo
  BUG-003  STATUS_LABELS sin DRAFT
  BUG-004  loan.status sin traducir en clientes/[id]
  BUG-005  ADVANCE sin traducción
  BUG-014  Estado hardcodeado en Agenda

Sesión 4 — Grupo responsive completo
  BUG-006  Agenda tabla sin overflow-x
  BUG-007  Clientes [id] overflow:hidden corta tabla
  BUG-015  Tablas con min-width fijo sin media queries

Sesión 5 — Robustez
  BUG-010  POST /api/loans sin Zod parse
  BUG-011  Acumulación redondeo en cuotas flat rate
```

---

*Última actualización: 2026-04-17 (actualizado — promoción de CAND-002 a CAND-005).*
