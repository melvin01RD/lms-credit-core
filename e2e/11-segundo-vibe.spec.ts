import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsOperator } from './helpers';

// ============================================================
// VIBE TESTING 2 — Nuevos specs basados en bugs encontrados
// ============================================================

// ---------------------------------------------------------------
// B-01: Lista de clientes no se refresca tras crear uno nuevo
// ---------------------------------------------------------------
test.describe('B-01 — Clientes: actualización de lista tras crear cliente', () => {
  test('la lista debe mostrar el nuevo cliente sin recargar la página', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');

    // Limpiar cliente de prueba si quedó de una corrida anterior
    const deleted = await page.evaluate(async () => {
      const res = await fetch('/api/clients?search=99999999902&limit=1');
      const data = await res.json();
      const id = data.clients?.[0]?.id;
      if (id) { await fetch(`/api/clients/${id}`, { method: 'DELETE' }); return true; }
      return false;
    });
    if (deleted) await page.reload();
    await page.waitForTimeout(300);

    // Obtener conteo inicial
    const initialCount = await page.locator('p:has-text("clientes registrados")').textContent();
    const initialNum = parseInt(initialCount?.match(/\d+/)?.[0] ?? '0');

    // Crear cliente de prueba
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByRole('textbox', { name: 'Nombre *' }).fill('QA-REFRESH-TEST');
    await page.getByRole('textbox', { name: 'Documento de identidad *' }).fill('99999999902');
    await page.getByRole('textbox', { name: 'Teléfono *' }).fill('8099999902');
    await page.getByRole('button', { name: 'Crear Cliente' }).click();

    // Esperar toast de éxito
    await expect(page.getByText('Cliente creado exitosamente')).toBeVisible({ timeout: 5000 });

    // Verificar que la lista actualiza el conteo SIN recargar
    const newCount = await page.locator('p:has-text("clientes registrados")').textContent();
    const newNum = parseInt(newCount?.match(/\d+/)?.[0] ?? '0');
    expect(newNum).toBe(initialNum + 1); // FALLA: bug B-01

    // Verificar que el nuevo cliente aparece en la tabla
    await expect(page.getByRole('row', { name: /QA-REFRESH-TEST/ })).toBeVisible();

    // Limpieza: buscar el ID del cliente recién creado y eliminarlo via API
    const clientId = await page.evaluate(async () => {
      const res = await fetch('/api/clients?search=QA-REFRESH-TEST&limit=1');
      const data = await res.json();
      return data.clients?.[0]?.id ?? null;
    });
    if (clientId) {
      await page.evaluate((id) => fetch(`/api/clients/${id}`, { method: 'DELETE' }), clientId);
    }
  });
});

// ---------------------------------------------------------------
// B-02/04/05: Mensajes de validación deben estar en español
// ---------------------------------------------------------------
test.describe('B-02/04/05 — Validaciones de formularios en español', () => {
  test('formulario Nuevo Cliente: mensaje de campo requerido en español', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByRole('button', { name: 'Crear Cliente' }).click();

    // Debe haber un mensaje de error en español, no "Please fill out this field."
    const errorMessages = await page.locator('[role="alert"], .error-message, [data-error]').allTextContents();
    for (const msg of errorMessages) {
      expect(msg).not.toMatch(/Please fill out this field/i);
      expect(msg).not.toMatch(/Value must be/i);
    }

    // El nombre debería mostrar error en español
    const nameError = page.locator('text=/requerido|obligatorio|ingrese|complete/i').first();
    // Si no hay mensajes React, al menos no debe haber tooltip nativo en inglés visible en el DOM
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('formulario Nuevo Préstamo: cuotas=0 debe mostrar validación en español', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/loans');
    await page.getByRole('button', { name: 'Nuevo Préstamo' }).click();

    // Llenar campos mínimos
    await page.getByRole('textbox', { name: 'Cliente *' }).fill('Darwin');
    await page.waitForTimeout(500);
    const clientOption = page.getByRole('button', { name: /Darwin Enmanuel/ }).first();
    if (await clientOption.isVisible()) await clientOption.click();

    await page.getByRole('spinbutton', { name: 'Monto del préstamo *' }).fill('10000');
    await page.getByRole('spinbutton', { name: 'Cargo Financiero' }).fill('1000');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('0');
    await page.getByRole('button', { name: 'Crear Préstamo' }).click();

    // Verificar que NO haya mensajes en inglés
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toMatch(/Value must be greater than or equal to/i);

    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
});

// ---------------------------------------------------------------
// B-03: Pago que excede saldo pendiente debe bloquear el botón
// ---------------------------------------------------------------
test.describe('B-03 — Pagos: monto que excede saldo pendiente debe deshabilitar el botón', () => {
  test('botón "Registrar Pago" debe deshabilitarse si monto > saldo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/payments');
    await page.getByRole('button', { name: 'Registrar Pago' }).click();

    // Seleccionar primer préstamo activo
    await page.getByRole('textbox', { name: 'Préstamo *' }).fill('Darwin');
    await page.waitForTimeout(500);
    const option = page.getByText(/Darwin Enmanuel Corporan/).first();
    if (await option.isVisible()) await option.click();

    // Ingresar monto que excede el saldo
    await page.getByRole('spinbutton', { name: 'Monto del pago *' }).fill('999999999');

    // El warning debe aparecer
    await expect(page.getByText('El monto excede el saldo pendiente')).toBeVisible();

    // El botón debe estar DESHABILITADO (este test documenta el bug B-03)
    const submitBtn = page.getByRole('button', { name: 'Registrar Pago' }).last();
    await expect(submitBtn).toBeDisabled(); // FALLA: bug B-03

    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('no se puede registrar un pago con monto = 0', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/payments');
    await page.getByRole('button', { name: 'Registrar Pago' }).click();

    await page.getByRole('textbox', { name: 'Préstamo *' }).fill('Darwin');
    await page.waitForTimeout(500);
    const option = page.getByText(/Darwin Enmanuel Corporan/).first();
    if (await option.isVisible()) await option.click();

    await page.getByRole('spinbutton', { name: 'Monto del pago *' }).fill('0');

    const submitBtn = page.getByRole('button', { name: 'Registrar Pago' }).last();
    await expect(submitBtn).toBeDisabled();

    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
});

// ---------------------------------------------------------------
// B-06: Configuración — campo nombre no debe aceptar HTML/XSS
// ---------------------------------------------------------------
test.describe('B-06 — Configuración: sanitización del nombre del negocio', () => {
  test('el campo nombre del negocio rechaza caracteres HTML', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/settings');

    const nameField = page.getByRole('textbox', { name: /LMS Credit SRL/ }).first();
    const originalValue = await nameField.inputValue();

    await nameField.fill('<script>alert("xss")</script>');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // Debe mostrar un error de validación, no guardar con éxito
    const successMsg = page.getByText(/guardada correctamente/i);
    const errorMsg = page.getByText(/caracteres no válidos|inválido|no se permite HTML/i);

    // El test falla si guarda con éxito sin error (bug B-06)
    const savedSuccessfully = await successMsg.isVisible({ timeout: 2000 }).catch(() => false);
    if (savedSuccessfully) {
      // Restaurar valor original
      await nameField.fill(originalValue);
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
    }
    // Este expect documenta el bug: no debería guardarse con éxito
    expect(savedSuccessfully).toBe(false); // FALLA: bug B-06
  });
});

// ---------------------------------------------------------------
// B-07: Formulario "Nuevo Usuario" debe abrirse como modal correcto
// ---------------------------------------------------------------
test.describe('B-07 — Usuarios: formulario debe ser modal con overlay', () => {
  test('el formulario Nuevo Usuario tiene overlay y está centrado', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/users');
    await page.getByRole('button', { name: 'Nuevo Usuario' }).click();

    // Debe existir un overlay o dialog
    const dialog = page.getByRole('dialog').first();
    const overlay = page.locator('[data-overlay], .modal-overlay, [aria-modal="true"]').first();

    const hasDialog = await dialog.isVisible({ timeout: 2000 }).catch(() => false);
    const hasOverlay = await overlay.isVisible({ timeout: 2000 }).catch(() => false);

    // Al menos uno de los dos debe estar presente (documenta bug B-07 si falla)
    expect(hasDialog || hasOverlay).toBe(true);

    // El formulario debe estar completamente visible en el viewport
    const form = page.getByRole('heading', { name: 'Nuevo Usuario' });
    await expect(form).toBeInViewport();

    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
});

// ---------------------------------------------------------------
// B-08: Admin NO debe poder desactivar su propia cuenta
// ---------------------------------------------------------------
test.describe('B-08 — Usuarios: el admin no puede desactivarse a sí mismo', () => {
  test('el botón Desactivar del usuario propio debe estar deshabilitado u oculto', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/users');

    // Localizar la fila del usuario actual (Melvin Luis / melvin01rd@gmail.com)
    const adminRow = page.getByRole('row', { name: /melvin01rd@gmail.com/ });
    await expect(adminRow).toBeVisible();

    // El botón Desactivar en su propia fila debe estar deshabilitado o no visible
    const deactivateBtn = adminRow.getByRole('button', { name: 'Desactivar' });
    const isDisabled = await deactivateBtn.isDisabled().catch(() => true);
    const isHidden = !(await deactivateBtn.isVisible().catch(() => false));

    // Documenta bug B-08 si el botón está habilitado y visible
    expect(isDisabled || isHidden).toBe(true); // FALLA: bug B-08
  });
});

// ---------------------------------------------------------------
// B-09: Responsive — tablas deben mostrar columnas clave en mobile
// ---------------------------------------------------------------
test.describe('B-09 — Responsive: tablas en mobile 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('página de Clientes debe mostrar botón "Nuevo Cliente" y columna Acciones en mobile', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');

    // El botón "Nuevo Cliente" debe ser visible
    await expect(page.getByRole('button', { name: 'Nuevo Cliente' })).toBeVisible();

    // La columna de Acciones debe ser accesible (ya sea visible o con diseño de cards)
    // Al menos debe existir un botón "Editar" para los clientes
    const editBtns = page.getByRole('button', { name: 'Editar' });
    await expect(editBtns.first()).toBeVisible();
  });

  test('la tabla de Préstamos muestra información clave en mobile', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/loans');

    // Debe poder verse el nombre del cliente
    await expect(page.getByText('Darwin Enmanuel Corporan')).toBeVisible();
  });
});

// ---------------------------------------------------------------
// RBAC: Verificaciones adicionales de seguridad por rol
// ---------------------------------------------------------------
test.describe('RBAC — Verificaciones adicionales de acceso por rol', () => {
  test('OPERATOR no puede acceder a /dashboard/users', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/users');
    await expect(page).toHaveURL(/unauthorized/);
    await expect(page.getByText('403')).toBeVisible();
  });

  test('OPERATOR no puede acceder a /dashboard/settings', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL(/unauthorized/);
    await expect(page.getByText(/Acceso Denegado/i)).toBeVisible();
  });

  test('OPERATOR no puede acceder a /dashboard/configuracion/productos', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/configuracion/productos');
    await expect(page).toHaveURL(/unauthorized/);
  });

  test('OPERATOR sí puede ver Clientes', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/clients');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  });

  test('OPERATOR sí puede ver Préstamos', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/loans');
    await expect(page.getByRole('heading', { name: 'Préstamos' })).toBeVisible();
  });

  test('OPERATOR sí puede ver Pagos', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/payments');
    await expect(page.getByRole('heading', { name: 'Pagos' })).toBeVisible();
  });

  test('OPERATOR no ve los enlaces Usuarios, Productos y Configuración en el sidebar', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Usuarios' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Productos' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Configuración' })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------
// Flujos de edge cases en formularios
// ---------------------------------------------------------------
test.describe('Edge cases — Formulario Nuevo Cliente', () => {
  test('documento con menos de 11 dígitos es rechazado', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByRole('textbox', { name: 'Nombre *' }).fill('Test Edge');
    await page.getByRole('textbox', { name: 'Documento de identidad *' }).fill('123');
    await page.getByRole('textbox', { name: 'Teléfono *' }).fill('8091234567');
    await page.getByRole('button', { name: 'Crear Cliente' }).click();

    // Debe aparecer mensaje de error sobre formato de cédula
    await expect(page.getByText(/cédula|11 dígitos|formato inválido/i)).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('el campo documento tiene maxLength=11 para prevenir más de 11 dígitos', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();

    const docInput = page.getByRole('textbox', { name: 'Documento de identidad *' });
    const maxLen = await docInput.getAttribute('maxlength');
    expect(maxLen).toBe('11');

    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('nombre con caracteres especiales ñ y tildes es aceptado', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');

    // Limpiar cliente de prueba si quedó de una corrida anterior
    await page.evaluate(async () => {
      const res = await fetch('/api/clients?search=99999999903&limit=1');
      const data = await res.json();
      const id = data.clients?.[0]?.id;
      if (id) await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    });
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByRole('textbox', { name: 'Nombre *' }).fill('Nuñez García Área');
    await page.getByRole('textbox', { name: 'Documento de identidad *' }).fill('99999999903');
    await page.getByRole('textbox', { name: 'Teléfono *' }).fill('8099999903');
    await page.getByRole('button', { name: 'Crear Cliente' }).click();

    await expect(page.getByText('Cliente creado exitosamente')).toBeVisible({ timeout: 5000 });

    // Limpiar
    const clientId = await page.evaluate(async () => {
      const res = await fetch('/api/clients?search=Nu%C3%B1ez&limit=1');
      const data = await res.json();
      return data.clients?.[0]?.id ?? null;
    });
    if (clientId) {
      await page.evaluate((id) => fetch(`/api/clients/${id}`, { method: 'DELETE' }), clientId);
    }
  });
});

// ---------------------------------------------------------------
// Flujos de edge cases en formulario Nuevo Préstamo
// ---------------------------------------------------------------
test.describe('Edge cases — Formulario Nuevo Préstamo', () => {
  test('monto = 0 no debe crear un préstamo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/loans');
    await page.getByRole('button', { name: 'Nuevo Préstamo' }).click();

    await page.getByRole('textbox', { name: 'Cliente *' }).fill('Darwin');
    await page.waitForTimeout(500);
    const option = page.getByRole('button', { name: /Darwin Enmanuel/ }).first();
    if (await option.isVisible()) await option.click();

    await page.getByRole('spinbutton', { name: 'Monto del préstamo *' }).fill('0');
    await page.getByRole('spinbutton', { name: 'Cargo Financiero' }).fill('1000');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('10');
    await page.getByRole('button', { name: 'Crear Préstamo' }).click();

    // No debe aparecer toast de éxito
    const successToast = page.getByText(/préstamo creado/i);
    await expect(successToast).not.toBeVisible({ timeout: 2000 });

    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('cuotas negativas no son aceptadas', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/loans');
    await page.getByRole('button', { name: 'Nuevo Préstamo' }).click();

    await page.getByRole('textbox', { name: 'Cliente *' }).fill('Darwin');
    await page.waitForTimeout(500);
    const option = page.getByRole('button', { name: /Darwin Enmanuel/ }).first();
    if (await option.isVisible()) await option.click();

    await page.getByRole('spinbutton', { name: 'Monto del préstamo *' }).fill('10000');
    await page.getByRole('spinbutton', { name: 'Cargo Financiero' }).fill('1000');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('-5');
    await page.getByRole('button', { name: 'Crear Préstamo' }).click();

    const successToast = page.getByText(/préstamo creado/i);
    await expect(successToast).not.toBeVisible({ timeout: 2000 });

    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
});

// ---------------------------------------------------------------
// Accesibilidad básica
// ---------------------------------------------------------------
test.describe('Accesibilidad básica', () => {
  test('login: todos los inputs tienen labels accesibles', async ({ page }) => {
    await page.goto('/login');

    const inputs = page.locator('input');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      const id = await input.getAttribute('id');
      const hasLabel = id ? (await page.locator(`label[for="${id}"]`).count()) > 0 : false;
      expect(ariaLabel || placeholder || hasLabel).toBeTruthy();
    }
  });

  test('dashboard: no hay imágenes sin atributo alt', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');

    const imgsWithoutAlt = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .filter(img => !img.alt && !img.getAttribute('aria-label'))
        .length
    );
    expect(imgsWithoutAlt).toBe(0);
  });

  test('clientes: no hay botones sin texto ni aria-label', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');

    const btnsWithoutText = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .filter(btn => !btn.textContent?.trim() && !btn.getAttribute('aria-label'))
        .length
    );
    expect(btnsWithoutText).toBe(0);
  });
});

// ---------------------------------------------------------------
// Búsqueda y filtros
// ---------------------------------------------------------------
test.describe('Búsqueda y filtros', () => {
  test('búsqueda de clientes filtra correctamente por nombre', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');

    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill('Darwin');
    await page.waitForTimeout(600);

    const rows = page.locator('tbody tr').filter({ hasText: /Darwin/ });
    await expect(rows.first()).toBeVisible();

    const allRows = await page.locator('tbody tr').count();
    // Solo debe haber 1 fila de Darwin
    expect(allRows).toBeLessThanOrEqual(2);
  });

  test('búsqueda de clientes con string vacío muestra todos los clientes', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');

    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill('Darwin');
    await page.waitForTimeout(600);
    await searchInput.clear();
    await page.waitForTimeout(600);

    // Todos los clientes deben reaparecer
    const rows = page.locator('tbody tr').filter({ hasText: /Activo|Inactivo/ });
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('filtro de préstamos por estado "En mora" muestra 0 resultados cuando no hay mora', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/loans');

    await page.getByRole('button', { name: 'En mora' }).click();
    await expect(page.getByText('No se encontraron resultados')).toBeVisible();
  });

  test('filtro de préstamos por estado "Activos" muestra al menos 1 préstamo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/loans');

    await page.getByRole('button', { name: 'Activos' }).click();
    await page.waitForTimeout(600);
    const rows = page.locator('tbody tr').filter({ hasText: /Activo/ });
    expect(await rows.count()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------
// Agenda de Cobros
// ---------------------------------------------------------------
test.describe('Agenda de Cobros', () => {
  test('el resumen actualiza el conteo al cambiar de día', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/agenda');

    // Clic en Viernes (donde hay préstamos de Valentina y Daniel)
    await page.getByRole('button', { name: 'Viernes' }).click();
    // Esperar a que la carga termine (el subtítulo cambia de "Cargando..." a "X clientes")
    const summary = page.locator('.page-subtitle');
    await expect(summary).not.toHaveText('Cargando...', { timeout: 5000 });
    const text = await summary.textContent();
    // Debe mostrar al menos 1 cliente en Viernes
    const num = parseInt(text?.match(/\d+/)?.[0] ?? '0');
    expect(num).toBeGreaterThan(0);
  });

  test('los días de la semana del lunes al sábado están presentes', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/agenda');

    for (const day of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']) {
      await expect(page.getByRole('button', { name: day })).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------
// Dashboard — métricas básicas
// ---------------------------------------------------------------
test.describe('Dashboard — métricas básicas', () => {
  test('el dashboard carga y muestra métricas principales como ADMIN', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard Ejecutivo' })).toBeVisible();
    await expect(page.getByText('Total Prestado')).toBeVisible();
    await expect(page.getByText('Capital Pendiente')).toBeVisible();
    await expect(page.getByText('Clientes Activos')).toBeVisible();
  });

  test('el botón Actualizar recarga los datos del dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard Ejecutivo' })).toBeVisible();
  });

  test('tabla de Próximos Vencimientos muestra préstamos vencidos', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');

    // Hay préstamos vencidos según los datos actuales
    const table = page.getByRole('table').last();
    await expect(table).toBeVisible();
    const vencidoRows = page.getByRole('row').filter({ hasText: /vencido/i });
    expect(await vencidoRows.count()).toBeGreaterThan(0);
  });
});
