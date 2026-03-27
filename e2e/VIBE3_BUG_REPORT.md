# Vibe Testing 3 — Bug Report
**Fecha:** 2026-03-26
**Tester:** QA Vibe Session 3 (Automatizado con Playwright MCP)
**App:** LMS Credit Core v1.0 — http://localhost:3000
**Scope:** Flujos de productos, configuración, detalles, pagos, agenda

---

## Tabla Resumen
| # | Severidad | Área | Descripción |
|---|-----------|------|-------------|
| C-01 | MEDIA | Productos | Tasa de interés 0% permitida en productos crediticios |
| C-02 | BAJA | Productos | Tasa de interés hasta 999% sin validación de límite máximo |
| C-03 | MEDIA | Detalle Cliente | Estado del préstamo se muestra en inglés "ACTIVE" en lugar de "Activo" |
| C-04 | MEDIA | Agenda | No existe tab "Domingo" — préstamos con cobro dominical no aparecen |
| C-05 | BAJA | Navegación | Console error "Failed to fetch RSC payload" al navegar back después de clic en fila |
| C-06 | ALTA | Préstamos | Formulario de nuevo préstamo no tiene campo "Fecha de inicio" — usa fecha de creación |
| C-07 | BAJA | Dashboard | Gráfico "Distribución de Cartera" no muestra etiquetas/leyenda de estados |
| C-08 | INFO | Pagos | No existe eliminación física de pagos; la reversión deja dos registros (audit trail) |
| C-09 | BAJA | Productos | No hay opción de eliminar productos crediticios desde la UI (solo desactivar) |
| C-10 | ALTA | Dashboard | "Capital Pendiente" muestra >100% del total prestado (incluye intereses futuros) |
| C-11 | INFO | Pagos | "Registrado por" muestra "—" en tab Pagos del detalle de préstamo (pero sí en lista global) |
| C-12 | INFO | Configuración | XSS payload almacenado persiste en BD desde sesión anterior (B-06 pendiente de limpiar) |

---

## Detalle de Bugs

### C-01 — Producto crediticio con tasa 0% es aceptado
- **Severidad:** MEDIA
- **Tipo:** Bug de Validación
- **Área:** Productos Crediticios
- **Screenshot:** `e2e/screenshots/vibe3-15-producto-tasa-cero.png`
- **Descripción:** El formulario de creación/edición de productos permite guardar una tasa de 0.00%, lo que generaría préstamos sin costo financiero.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/configuracion/productos`
  2. Clic en "Nuevo Producto"
  3. Ingresar nombre, dejar Tasa = 0
  4. Clic "Crear producto"
- **Resultado actual:** El producto se crea con 0.00% sin error de validación.
- **Resultado esperado:** Mostrar error "La tasa debe ser mayor a 0" o similar.

---

### C-02 — Producto crediticio con tasa 999% (sin límite superior)
- **Severidad:** BAJA
- **Tipo:** Bug de Validación
- **Área:** Productos Crediticios
- **Screenshot:** `e2e/screenshots/vibe3-16-producto-tasa-999.png`
- **Descripción:** El sistema acepta tasas arbitrariamente altas (999% o más) sin validación de rango máximo razonable.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/configuracion/productos`
  2. Editar un producto
  3. Cambiar tasa a 999
  4. Clic "Guardar cambios"
- **Resultado actual:** El producto se guarda con 999.00% sin advertencia.
- **Resultado esperado:** Validar que la tasa esté dentro de un rango razonable (ej. 0.01%–200%).

---

### C-03 — Estado del préstamo en inglés "ACTIVE" en detalle de cliente
- **Severidad:** MEDIA
- **Tipo:** Bug de UI / Internacionalización
- **Área:** Detalle de Cliente
- **Screenshot:** `e2e/screenshots/vibe3-29-client-detail-ACTIVE-untranslated.png`
- **Descripción:** En la tabla de préstamos dentro del detalle de cliente, el estado aparece como "ACTIVE" (en inglés) en lugar de "Activo" (en español), a diferencia del listado de préstamos y del detalle del préstamo donde sí está traducido.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/clients`
  2. Clic en un cliente con préstamos activos
  3. Observar columna "Estado" de la tabla de préstamos
- **Resultado actual:** Se muestra "ACTIVE" en badge verde.
- **Resultado esperado:** Se debe mostrar "Activo" en español.

---

### C-04 — Agenda de Cobros no tiene tab "Domingo"
- **Severidad:** MEDIA
- **Tipo:** Bug de Funcionalidad
- **Área:** Agenda de Cobros
- **Screenshot:** `e2e/screenshots/vibe3-09-agenda.png`
- **Descripción:** La Agenda muestra tabs para Lunes, Martes, Miércoles, Jueves, Viernes y Sábado, pero no tiene tab para "Domingo". Si un préstamo tiene día de cobro dominical, no podrá gestionarse desde la agenda.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/agenda`
  2. Observar los tabs disponibles
- **Resultado actual:** Solo 6 días (Lun–Sáb). No existe "Domingo".
- **Resultado esperado:** 7 días de la semana disponibles, incluyendo Domingo.

---

### C-05 — Error de consola "Failed to fetch RSC payload" al navegar con back
- **Severidad:** BAJA
- **Tipo:** Bug de Navegación
- **Área:** Navegación general
- **Screenshot:** `e2e/screenshots/vibe3-24-sql-injection-search.png`
- **Descripción:** Al hacer back del navegador desde ciertas páginas, aparece un error de consola "Failed to fetch RSC payload" que puede indicar problemas con el caché de Next.js o redirecciones inesperadas.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/clients`
  2. Clic en un cliente para ir al detalle
  3. Presionar Back del navegador
  4. Observar la consola del browser
- **Resultado actual:** Error en consola: "Failed to fetch RSC payload for http://localhost:3000/..."
- **Resultado esperado:** Navegación sin errores de consola.

---

### C-06 — Formulario "Nuevo Préstamo" no tiene campo de Fecha de inicio
- **Severidad:** ALTA
- **Tipo:** Bug de Funcionalidad / UX
- **Área:** Creación de Préstamos
- **Screenshot:** `e2e/screenshots/vibe3-30-nuevo-prestamo-no-fecha.png`
- **Descripción:** El formulario de creación de préstamo no permite especificar una fecha de inicio. El sistema usa la fecha de creación del registro como fecha de inicio del préstamo. En entornos productivos donde se registran préstamos con fecha retroactiva, esto genera incorrección en el calendario de pagos.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/loans`
  2. Clic "Nuevo Préstamo"
  3. Observar los campos disponibles
- **Resultado actual:** No existe campo "Fecha de inicio" o "Fecha de desembolso".
- **Resultado esperado:** Campo de fecha configurable para poder registrar préstamos con fecha pasada o futura.

---

### C-07 — Gráfico "Distribución de Cartera" sin leyenda ni etiquetas
- **Severidad:** BAJA
- **Tipo:** Bug de UI
- **Área:** Dashboard
- **Screenshot:** `e2e/screenshots/vibe3-31-dashboard-pie-chart.png`
- **Descripción:** El gráfico de pie "Distribución de Cartera" en el dashboard muestra el círculo completo en azul sólido sin etiquetas de categoría, porcentajes ni leyenda visible. No hay forma de saber qué representa el gráfico.
- **Pasos de reproducción:**
  1. Ir a `/dashboard`
  2. Observar la sección "Distribución de Cartera"
- **Resultado actual:** Círculo azul sin texto ni leyenda.
- **Resultado esperado:** Gráfico con etiquetas, porcentajes y/o leyenda (ej. "Activos: 3 (100%)").

---

### C-08 — No existe eliminación física de pagos; la "Reversión" no elimina el original
- **Severidad:** INFO
- **Tipo:** Comportamiento de sistema / Audit Trail
- **Área:** Pagos
- **Descripción:** Al "Reversar" un pago, el sistema crea un nuevo registro negativo (tipo "Reversión") pero mantiene el registro original. Esto es correcto desde el punto de vista contable (audit trail), pero no queda documentado para el usuario que espera "deshacer" el pago. Además, no existe forma de eliminar físicamente un pago incorrecto.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/payments`
  2. Clic en un pago > "Reversar Pago"
  3. Confirmar reversión
  4. Observar que ahora hay 2 registros: el original y la reversión
- **Resultado actual:** 2 registros: pago original + pago de reversión (negativo).
- **Resultado esperado (sugerencia):** Documentar claramente al usuario que la reversión es un audit trail y no una eliminación.

---

### C-09 — No hay opción de eliminar productos crediticios desde la UI
- **Severidad:** BAJA
- **Tipo:** Bug de Funcionalidad
- **Área:** Productos Crediticios
- **Descripción:** En la página de productos crediticios, solo hay opciones de "Editar" y "Desactivar/Activar". No existe botón de "Eliminar". Un producto mal configurado (ej. con tasa 999%) permanece en el sistema indefinidamente.
- **Pasos de reproducción:**
  1. Ir a `/dashboard/configuracion/productos`
  2. Observar las acciones disponibles por producto
- **Resultado actual:** Solo "Editar" y "Desactivar".
- **Resultado esperado:** Opción de eliminar productos que no estén en uso (sin préstamos asociados).

---

### C-10 — "Capital Pendiente" en dashboard puede superar el 100% del total prestado
- **Severidad:** ALTA
- **Tipo:** Bug de Datos / UI confusa
- **Área:** Dashboard, Detalle de Préstamo
- **Screenshot:** `e2e/screenshots/vibe3-05-loan-detail-darwin.png`
- **Descripción:** El campo "Capital Pendiente" en el dashboard y en el detalle de préstamo muestra un monto mayor al capital original. Por ejemplo, un préstamo de RD$ 20,000 muestra "Capital Pendiente: RD$ 28,000.00 (103.7% del total)". Esto ocurre porque "Capital Pendiente" incluye también el cargo financiero (intereses flat), no solo el capital. La etiqueta es confusa y engañosa.
- **Pasos de reproducción:**
  1. Ir a `/dashboard` — observar métrica "Capital Pendiente"
  2. Ir al detalle de un préstamo con pagos parciales
  3. Observar "Capital pendiente" en la barra de progreso y en "Datos del préstamo"
- **Resultado actual:** "Capital Pendiente" = RD$ 28,000 para préstamo de RD$ 20,000 (incluye cargo financiero de RD$ 15,000, menos 2 cuotas pagadas de RD$ 3,500 c/u).
- **Resultado esperado:** Clarificar la etiqueta: "Saldo Pendiente Total" o "Balance Pendiente" para reflejar que incluye capital + intereses pendientes. O separar en dos métricas distintas.

---

### C-11 — "Registrado por" aparece como "—" en historial de pagos del préstamo
- **Severidad:** INFO
- **Tipo:** Bug de Datos
- **Área:** Detalle de Préstamo — Tab Pagos
- **Screenshot:** `e2e/screenshots/vibe3-07-loan-payments-tab.png`
- **Descripción:** En el tab "Pagos" del detalle de préstamo, la columna "Registrado por" muestra "—" para todos los pagos. Sin embargo, en la lista global de pagos `/dashboard/payments`, los mismos pagos sí muestran "Melvin Luis" como registrador. Los datos existen pero no se pasan correctamente a este componente.
- **Pasos de reproducción:**
  1. Ir al detalle de un préstamo con pagos
  2. Clic en tab "Pagos (N)"
  3. Observar columna "Registrado por"
- **Resultado actual:** "—" en todos los registros.
- **Resultado esperado:** Nombre del usuario que registró el pago.

---

### C-12 — Payload XSS almacenado en nombre del negocio (B-06 pendiente de remediación)
- **Severidad:** ALTA (ya conocido como B-06)
- **Tipo:** Seguridad — Stored XSS
- **Área:** Configuración — Datos del Negocio
- **Screenshot:** `e2e/screenshots/vibe3-18-config-xss-stored.png`
- **Descripción:** El campo "Nombre del negocio" en Configuración contenía el payload `<script>alert("xss")</script>` almacenado en la base de datos desde la sesión Vibe 2. React renderiza el valor como texto plano (no ejecuta el script), pero el payload persiste en la BD. Se limpió manualmente durante esta sesión cambiándolo a "LMS Credit SRL".
- **Nota:** Este bug ya fue reportado como B-06 en VIBE2_BUG_REPORT.md. Se confirma que persiste y se documenta la limpieza.

---

## Bugs de Sesiones Anteriores Verificados como Resueltos
- **B-03 (botón pago no se deshabilita):** Verificado resuelto — el botón "Registrar Pago" se deshabilita correctamente mientras no se selecciona un préstamo.
- **B-08 (admin puede desactivarse):** No verificado en esta sesión.

## Observaciones Adicionales
1. **Agenda defaultea al día de hoy** (correcto) pero el subtítulo muestra "0 clientes" si no hay préstamos para ese día específico, aunque sí los hay para otros días de la semana.
2. **SQL Injection en búsqueda:** Probado con `'; DROP TABLE clients; --` — el sistema responde correctamente con "No se encontraron resultados" sin errores.
3. **Strings largos (600 chars) en búsqueda:** Manejado correctamente sin errores.
4. **RBAC para OPERATOR:** Correcto — rutas `/users`, `/configuracion/productos`, `/settings` redirigen a `/unauthorized` con código 403.
5. **Responsive (mobile 375x812):** Las tablas confirman bug B-09 (overflow horizontal). El dashboard es usable en mobile.
6. **Filtro "Todos" en lista préstamos:** La página muestra "3 préstamos registrados" pero el contador del dashboard marcaba los préstamos que incluyen también los de la cartera fijo. Consistente.
