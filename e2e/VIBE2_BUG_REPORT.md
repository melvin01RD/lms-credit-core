# Vibe Testing 2 — Bug Report
**Fecha:** 2026-03-27
**Tester:** QA Vibe Session (Automatizado con Playwright MCP)
**App:** LMS Credit Core v1.0 — http://localhost:3000
**Scope:** Sesión completa: Reconocimiento, Flujos core, Edge cases, Responsive, Accesibilidad, Roles

---

## Tabla Resumen

| # | Severidad | Área | Descripción |
|---|-----------|------|-------------|
| B-01 | MEDIA | Clientes — UI | Lista de clientes NO se refresca tras crear un cliente (stale data) |
| B-02 | BAJA | Clientes — i18n | Mensajes de validación HTML5 en inglés ("Please fill out this field.") |
| B-03 | ALTA | Pagos — Validación | Se puede intentar enviar pago que excede el saldo pendiente (warning visible pero botón no bloqueado) |
| B-04 | BAJA | Pagos — i18n | Validación de fecha futura en inglés ("Value must be 03/27/2026 or earlier.") |
| B-05 | BAJA | Préstamos — i18n | Validación de cuotas=0 en inglés ("Value must be greater than or equal to 1.") |
| B-06 | MEDIA | Configuración — Seguridad | Campo "Nombre del negocio" acepta y guarda payload XSS (`<script>alert('xss')</script>`) sin sanitización |
| B-07 | MEDIA | Usuarios — UI | Formulario "Nuevo Usuario" se renderiza fuera del área visible (overflow, no modal flotante) |
| B-08 | BAJA | Usuarios — Seguridad | Admin puede hacer clic en "Desactivar" sobre su propio usuario (no hay protección contra self-lockout) |
| B-09 | MEDIA | Responsive — Tablas | Tablas de Clientes, Préstamos, Pagos y Usuarios se cortan en mobile (375px) y tablet (768px); columnas Estado y Acciones invisibles sin scroll horizontal |
| B-10 | BAJA | Clientes — DELETE | DELETE /api/clients/:id realiza soft-delete (marca Inactivo) en lugar de hard-delete; el contador de clientes no descuenta los inactivos |
| B-11 | BAJA | Dashboard — Datos | "Capital Pendiente" muestra RD$ 197.0K (103.7% del total prestado de RD$ 190.0K) — la métrica incluye intereses no cobrados, no solo capital; etiqueta confusa |
| B-12 | BAJA | Préstamos — Datos | En detalle de préstamo, "Capital pendiente" = RD$ 28,000 para un préstamo de RD$ 20,000 — representa saldo total (capital + interés), no solo capital |
| B-13 | INFO | Clientes — Nombre | Campo "Nombre" acepta etiquetas HTML (`<script>`) sin validación; se renderiza como texto (no ejecutado), pero conviene sanitizar |

---

## Detalle de Bugs

### B-01 — Lista de Clientes no se refresca tras crear un nuevo cliente
- **Severidad:** MEDIA
- **Tipo:** Bug de UI / State management
- **Área:** Clientes
- **Screenshot:** `e2e/screenshots/07-cliente-qa-created.png`
- **Descripción:** Después de crear un cliente con éxito (toast "Cliente creado exitosamente"), la lista sigue mostrando el conteo y filas anteriores. El nuevo cliente solo aparece al recargar la página.
- **Pasos de reproducción:**
  1. Login como ADMIN.
  2. Ir a /dashboard/clients.
  3. Click en "Nuevo Cliente", rellenar campos requeridos y hacer click en "Crear Cliente".
  4. Observar el toast de éxito.
  5. Revisar la lista sin recargar la página.
- **Resultado actual:** La lista muestra "3 clientes registrados" y no muestra el cliente recién creado.
- **Resultado esperado:** La lista debe actualizarse automáticamente mostrando el nuevo cliente y el conteo correcto.

---

### B-02 — Mensajes de validación de formularios en inglés (i18n)
- **Severidad:** BAJA
- **Tipo:** Bug de localización
- **Área:** Clientes, Préstamos, Pagos, Usuarios
- **Screenshot:** `e2e/screenshots/05-cliente-empty-submit-bug.png`, `e2e/screenshots/21-usuario-empty-submit.png`
- **Descripción:** Los mensajes de validación HTML5 nativa del navegador aparecen en inglés: "Please fill out this field." en lugar de un mensaje en español. Esto es un problema de UX especialmente en un sistema en español.
- **Pasos de reproducción:**
  1. Abrir el formulario "Nuevo Cliente" o "Nuevo Usuario".
  2. Dejar vacío el campo "Nombre *".
  3. Hacer click en "Crear Cliente" / "Crear Usuario".
  4. Observar el tooltip de validación del navegador.
- **Resultado actual:** "Please fill out this field." (en inglés)
- **Resultado esperado:** "Por favor, completa este campo." (en español) — usando validación React controlada en lugar de HTML5 nativa.

---

### B-03 — Pago con monto mayor al saldo pendiente puede enviarse
- **Severidad:** ALTA
- **Tipo:** Bug de validación / regla de negocio
- **Área:** Pagos
- **Screenshot:** `e2e/screenshots/15-pago-monto-excede-saldo.png`
- **Descripción:** Al ingresar un monto de pago superior al saldo pendiente del préstamo, el formulario muestra un warning "El monto excede el saldo pendiente" pero el botón "Registrar Pago" permanece habilitado. Si el backend no lo bloquea también, se podría registrar un sobrepago.
- **Pasos de reproducción:**
  1. Ir a /dashboard/payments > "Registrar Pago".
  2. Seleccionar cualquier préstamo activo.
  3. Ingresar monto = 999999999 (mayor al saldo).
  4. Observar el warning y el estado del botón.
- **Resultado actual:** Warning visible pero botón "Registrar Pago" habilitado y clickeable.
- **Resultado esperado:** El botón "Registrar Pago" debe deshabilitarse cuando el monto supera el saldo pendiente.

---

### B-04 — Validación de fecha futura en inglés (pagos)
- **Severidad:** BAJA
- **Tipo:** Bug de localización
- **Área:** Pagos
- **Screenshot:** `e2e/screenshots/15-pago-monto-excede-saldo.png`
- **Descripción:** Al intentar registrar un pago con fecha futura (ej. 2099-12-31), el navegador muestra "Value must be 03/27/2026 or earlier." en inglés.
- **Pasos de reproducción:**
  1. Ir a "Registrar Pago".
  2. Seleccionar un préstamo.
  3. Cambiar la fecha a 2099-12-31.
  4. Hacer click en "Registrar Pago".
- **Resultado actual:** Validación HTML5 nativa en inglés.
- **Resultado esperado:** Validación React controlada en español: "La fecha no puede ser futura."

---

### B-05 — Validación de cuotas=0 en inglés (nuevo préstamo)
- **Severidad:** BAJA
- **Tipo:** Bug de localización
- **Área:** Préstamos
- **Screenshot:** `e2e/screenshots/11-prestamo-zero-values.png`
- **Descripción:** Al intentar crear un préstamo con "Número de cuotas" = 0, aparece "Value must be greater than or equal to 1." en inglés.
- **Pasos de reproducción:**
  1. Ir a /dashboard/loans > "Nuevo Préstamo".
  2. Completar todos los campos requeridos excepto cuotas.
  3. Ingresar 0 en "Número de cuotas".
  4. Hacer click en "Crear Préstamo".
- **Resultado actual:** "Value must be greater than or equal to 1." (en inglés)
- **Resultado esperado:** Validación en español.

---

### B-06 — Campo "Nombre del negocio" acepta payload XSS
- **Severidad:** MEDIA
- **Tipo:** Bug de seguridad / validación de entrada
- **Área:** Configuración
- **Screenshot:** `e2e/screenshots/24-configuracion-xss-saved.png`
- **Descripción:** El campo "Nombre del negocio" en Configuración acepta y persiste `<script>alert('xss')</script>` sin sanitización ni validación. Aunque React escapa el HTML al renderizar (no hay ejecución del script), el valor persiste en la base de datos y puede aparecer en documentos PDF generados u otros contextos donde no se escapen correctamente.
- **Pasos de reproducción:**
  1. Login como ADMIN > Configuración.
  2. Borrar el contenido del campo "Nombre del negocio".
  3. Escribir `<script>alert('xss')</script>`.
  4. Hacer click en "Guardar cambios".
- **Resultado actual:** Se guarda con éxito. El valor aparece como texto en la UI pero se almacena sin sanitizar.
- **Resultado esperado:** El formulario debe rechazar caracteres HTML/script con un mensaje de error, o sanitizar el input antes de persistirlo.

---

### B-07 — Formulario "Nuevo Usuario" con problemas de UI (overflow)
- **Severidad:** MEDIA
- **Tipo:** Bug de UI / layout
- **Área:** Usuarios
- **Screenshot:** `e2e/screenshots/20-nuevo-usuario-form.png`, `e2e/screenshots/21-usuario-empty-submit.png`
- **Descripción:** Al abrir el formulario "Nuevo Usuario", este se renderiza parcialmente fuera de los límites visibles del viewport. A diferencia de otros formularios (Clientes, Préstamos), no aparece como un modal flotante centrado, sino superpuesto sobre el contenido de la página sin un overlay correcto.
- **Pasos de reproducción:**
  1. Login como ADMIN > Usuarios.
  2. Hacer click en "Nuevo Usuario".
  3. Observar el formulario en pantalla.
- **Resultado actual:** El formulario aparece en el borde inferior del viewport, parte del mismo queda cortada. La lista de usuarios sigue visible detrás.
- **Resultado esperado:** El formulario debe abrirse en un modal flotante centrado con overlay oscuro, igual que los formularios de Clientes y Préstamos.

---

### B-08 — Admin puede desactivar su propio usuario (self-lockout)
- **Severidad:** MEDIA
- **Tipo:** Bug de seguridad / regla de negocio
- **Área:** Usuarios
- **Screenshot:** `e2e/screenshots/19-usuarios.png`
- **Descripción:** En la página de Usuarios, el ADMIN puede hacer click en el botón "Desactivar" de su propio usuario. Si lo confirma, se quedaría sin acceso al sistema sin posibilidad de recuperación desde la UI.
- **Pasos de reproducción:**
  1. Login como ADMIN > Usuarios.
  2. Localizar la fila del propio usuario ADMIN.
  3. Observar el botón "Desactivar" disponible.
- **Resultado actual:** El botón "Desactivar" está visible y clickeable sobre el usuario ADMIN activo.
- **Resultado esperado:** El botón "Desactivar" debe estar oculto o deshabilitado para el propio usuario que tiene sesión activa.

---

### B-09 — Tablas no son responsivas en mobile y tablet
- **Severidad:** MEDIA
- **Tipo:** Bug de UI / responsive
- **Área:** Clientes, Préstamos, Pagos, Usuarios
- **Screenshot:** `e2e/screenshots/27-mobile-clientes-overflow.png`, `e2e/screenshots/28-tablet-768-clientes.png`
- **Descripción:** En viewports de 375px (mobile) y 768px (tablet), las tablas de datos exceden el ancho disponible. Las columnas "Estado" y "Acciones" quedan fuera del viewport y requieren scroll horizontal para acceder. El botón "Nuevo Cliente" desaparece del área visible. No existe un diseño de tarjetas (cards) para pantallas pequeñas.
- **Pasos de reproducción:**
  1. Cambiar viewport a 375×812 o 768×1024.
  2. Navegar a /dashboard/clients, /dashboard/loans, etc.
  3. Observar la tabla.
- **Resultado actual:** Tabla desborda horizontalmente. Columnas clave (Estado, Acciones) no visibles sin scroll horizontal.
- **Resultado esperado:** Diseño responsive con tarjetas apiladas en mobile, o columnas prioritarias que se muestren con scroll interior definido.

---

### B-10 — DELETE de cliente realiza soft-delete; contador no actualiza
- **Severidad:** BAJA
- **Tipo:** Bug de comportamiento / UX
- **Área:** Clientes — API
- **Descripción:** Al llamar DELETE /api/clients/:id, el API retorna 200 OK pero en lugar de eliminar el registro, lo marca como "Inactivo". El cliente permanece visible en la lista con estado "Inactivo". El contador de clientes ("4 clientes registrados") no descuenta los registros inactivos.
- **Pasos de reproducción:**
  1. Llamar DELETE /api/clients/{id} con un cliente inactivo.
  2. Navegar a /dashboard/clients.
  3. Observar el estado del cliente y el contador.
- **Resultado actual:** Cliente aparece con estado "Inactivo"; contador sigue en 4.
- **Resultado esperado:** Si es soft-delete por diseño, el contador debe excluir clientes inactivos. Si es hard-delete, el registro debe eliminarse completamente.

---

### B-11 — Etiqueta "Capital Pendiente" en dashboard muestra saldo total (capital + interés)
- **Severidad:** BAJA
- **Tipo:** Bug de datos / etiqueta confusa
- **Área:** Dashboard
- **Screenshot:** `e2e/screenshots/02-dashboard-admin.png`
- **Descripción:** La tarjeta "Capital Pendiente" muestra RD$ 197.0K con subtítulo "103.7% del total" para un total prestado de RD$ 190.0K. Esto ocurre porque el campo calcula el saldo total incluyendo intereses no cobrados, no solo el capital pendiente. La denominación "Capital Pendiente" es financieramente incorrecta.
- **Resultado actual:** "Capital Pendiente: RD$ 197.0K (103.7% del total)" cuando el total prestado es RD$ 190.0K.
- **Resultado esperado:** Renombrar a "Saldo Total Pendiente" o asegurarse de que el cálculo refleje solo el capital sin intereses.

---

### B-12 — "Capital pendiente" en lista de préstamos incluye intereses futuros
- **Severidad:** BAJA
- **Tipo:** Bug de datos / etiqueta confusa
- **Área:** Préstamos
- **Screenshot:** `e2e/screenshots/08-prestamos-list.png`, `e2e/screenshots/12-prestamo-detail.png`
- **Descripción:** En la lista y detalle de préstamos, la columna/campo "Capital pendiente" muestra RD$ 28,000 para un préstamo de RD$ 20,000. Esto representa el saldo total de cuotas restantes (8 cuotas × RD$ 3,500 = RD$ 28,000), no el capital neto pendiente (que según la tabla de amortización sería RD$ 16,000). La denominación induce a error.
- **Resultado actual:** "Capital pendiente: RD$ 28,000" para un préstamo de RD$ 20,000 con 2 cuotas pagadas.
- **Resultado esperado:** Renombrar la columna a "Saldo por cobrar" o "Total pendiente (capital + interés)" para distinguir del capital neto.

---

### B-13 — Campo "Nombre" del cliente acepta etiquetas HTML sin validación
- **Severidad:** INFO
- **Tipo:** Mejora de seguridad / validación
- **Área:** Clientes
- **Screenshot:** `e2e/screenshots/06-cliente-xss-validation.png`
- **Descripción:** El campo "Nombre" acepta y almacena `<script>alert(1)</script>` sin validación ni sanitización. React escapa correctamente al renderizar, pero el valor crudo puede propagarse a PDFs o reportes.
- **Resultado actual:** El nombre `<script>alert(1)</script>` se acepta (aunque el documento es rechazado por validación de cédula).
- **Resultado esperado:** Validar que el nombre solo contenga caracteres alfanuméricos, espacios, guiones y tildes (regex de nombre de persona).

---

## Hallazgos Positivos

- Login con credenciales incorrectas muestra error apropiado.
- Control de roles (RBAC) funciona correctamente: OPERATOR redirige a 403 al intentar acceder a Usuarios, Configuración o Productos.
- Sidebar de OPERATOR solo muestra rutas permitidas.
- API retorna 403 en endpoints de ADMIN cuando se accede con token de OPERATOR.
- Menú hamburger en mobile funciona correctamente.
- Búsqueda en tiempo real de Clientes y Préstamos funciona.
- Filtros por estado en Préstamos y Pagos funcionan.
- Accesibilidad básica: imágenes con alt, inputs con labels, botones con texto (excepto toggle de contraseña en login).
- No hay errores de consola en ninguna página bajo uso normal.
- PDF de Cartera Vigente se genera correctamente.
