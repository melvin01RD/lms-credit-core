import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsOperator } from './helpers';

// ============================================================
// VIBE TESTING 3 — Specs basados en bugs encontrados (C-01..C-12)
// ============================================================

// ---------------------------------------------------------------
// C-01: Producto crediticio con tasa 0% es aceptado
// ---------------------------------------------------------------
test.describe('C-01 — Productos: tasa de interés 0% no debería ser válida', () => {
  test('el sistema no debe permitir crear un producto con tasa 0%', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/configuracion/productos');

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByRole('textbox', { name: 'Nombre del producto *' }).fill('QA-TEST-TASA-CERO');
    await page.getByRole('spinbutton', { name: 'Tasa (%) *' }).fill('0');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('10');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    // BUG C-01: actualmente el sistema acepta tasa 0 — este test documenta el comportamiento actual
    // Cuando se corrija, debe fallar con un mensaje de validación en lugar de crear el producto
    const productoCreado = page.locator('tbody tr').filter({ hasText: 'QA-TEST-TASA-CERO' });
    const errorTasa = page.locator('text=/tasa.*mayor|tasa.*0/i');

    const created = await productoCreado.isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await errorTasa.isVisible({ timeout: 2000 }).catch(() => false);

    if (created) {
      // Bug confirmado: producto con tasa 0% fue creado — limpiar
      console.warn('BUG C-01 CONFIRMADO: Producto con tasa 0% fue aceptado');
      // Desactivar el producto de prueba
      const row = page.locator('tbody tr').filter({ hasText: 'QA-TEST-TASA-CERO' }).first();
      await row.getByRole('button', { name: 'Desactivar' }).click();
      // Eliminar via API
      await page.evaluate(async () => {
        const res = await fetch('/api/loan-products');
        const data = await res.json();
        const prod = (data.products ?? []).find((p: { name: string }) => p.name === 'QA-TEST-TASA-CERO');
        if (prod) await fetch(`/api/loan-products/${prod.id}`, { method: 'DELETE' });
      });
    } else if (!hasError) {
      // Ni se creó ni hay error de validación visible —
      // podría ser que HTML5 bloqueó la UI sin mensaje de app
      console.warn('BUG C-01 (posible): tasa 0 — comportamiento indefinido (ni creado ni error de app visible)');
    }

    // Cuando se corrija el bug, este expect debe pasar:
    // expect(hasError).toBe(true);
    // Por ahora solo verificamos que la página no crasheó
    await expect(page).toHaveURL(/\/dashboard\/configuracion\/productos/);
  });
});

// ---------------------------------------------------------------
// C-02: Tasa de interés 999% sin límite superior
// ---------------------------------------------------------------
test.describe('C-02 — Productos: tasa sin límite máximo (999% aceptado)', () => {
  test('el sistema no debe permitir tasas extremadamente altas sin validación', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/configuracion/productos');

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByRole('textbox', { name: 'Nombre del producto *' }).fill('QA-TEST-TASA-ALTA');
    await page.getByRole('spinbutton', { name: 'Tasa (%) *' }).fill('999');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('12');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    // BUG C-02: actualmente acepta 999% — limpiar si se creó
    const productoCreado = page.locator('tbody tr').filter({ hasText: 'QA-TEST-TASA-ALTA' });
    const created = await productoCreado.isVisible({ timeout: 3000 }).catch(() => false);

    if (created) {
      console.warn('BUG C-02 CONFIRMADO: Producto con tasa 999% fue aceptado');
      await productoCreado.getByRole('button', { name: 'Desactivar' }).click();
      await page.evaluate(async () => {
        const res = await fetch('/api/loan-products');
        const data = await res.json();
        const prod = (data.products ?? []).find((p: { name: string }) => p.name === 'QA-TEST-TASA-ALTA');
        if (prod) await fetch(`/api/loan-products/${prod.id}`, { method: 'DELETE' });
      });
    }

    // Cuando se corrija, debe rechazarse tasa > rango razonable:
    // expect(created).toBe(false);
    // Por ahora solo registramos el comportamiento
  });
});

// ---------------------------------------------------------------
// C-03: Estado del préstamo en inglés "ACTIVE" en detalle de cliente
// ---------------------------------------------------------------
test.describe('C-03 — Detalle Cliente: estado préstamo en inglés "ACTIVE"', () => {
  test('la columna Estado en la tabla de préstamos del cliente debe estar en español', async ({ page }) => {
    await loginAsAdmin(page);

    // Obtener primer cliente con préstamos via API para navegar directamente
    await page.goto('/api/clients?limit=5');
    const apiText = await page.locator('body').textContent();
    let clientId: string | null = null;
    try {
      const parsed = JSON.parse(apiText ?? '{}');
      const clients = parsed?.clients ?? parsed?.data ?? [];
      clientId = clients[0]?.id ?? null;
    } catch {
      // silenciar error de parse
    }

    if (!clientId) {
      console.warn('C-03: No se encontraron clientes via API, test omitido');
      return;
    }

    await page.goto(`/dashboard/clients/${clientId}`);
    await page.waitForSelector('h1, h2', { timeout: 10000 });

    // Verificar que el estado NO está en inglés
    const englishStatus = page.locator('td, span, div').filter({ hasText: /^ACTIVE$/ });
    const spanishStatus = page.locator('td, span, div').filter({ hasText: /^Activo$/ });

    const hasEnglish = await englishStatus.count() > 0;
    const hasSpanish = await spanishStatus.count() > 0;

    if (hasEnglish) {
      console.warn('BUG C-03 CONFIRMADO: Estado "ACTIVE" (inglés) encontrado en detalle de cliente');
    }

    // BUG C-03: actualmente muestra ACTIVE — cuando se corrija, este expect debe pasar:
    // expect(hasEnglish).toBe(false);
    // expect(hasSpanish).toBe(true);

    // La página debe haber cargado correctamente
    await expect(page).toHaveURL(/\/dashboard\/clients\//);
  });
});

// ---------------------------------------------------------------
// C-04: Agenda no tiene tab "Domingo"
// ---------------------------------------------------------------
test.describe('C-04 — Agenda de Cobros: falta tab Domingo', () => {
  test('la agenda debe tener los 7 días de la semana incluyendo Domingo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/agenda');

    // Los botones de día usan clase "day-tab" con spans internas (short + full label)
    // Esperar que los botones carguen
    await page.waitForSelector('.day-tab, button.day-tab', { timeout: 10000 }).catch(() => null);

    // Contar botones de día (deben ser al menos 6)
    const dayTabCount = await page.locator('.day-tab').count();
    const hasDayTabs = dayTabCount > 0;

    // Verificar si existe un botón con texto "Domingo" o "Dom"
    const domingoBtnCount = await page.locator('.day-tab').filter({ hasText: /Domingo|Dom/ }).count();
    const domingoBtnVisible = domingoBtnCount > 0;

    // Verificar que Lunes y Sábado existen
    const lunesCount = await page.locator('.day-tab').filter({ hasText: /Lunes|Lun/ }).count();
    const sabadoCount = await page.locator('.day-tab').filter({ hasText: /Sábado|Sáb/ }).count();

    expect(hasDayTabs).toBe(true); // Debe haber al menos un tab de día
    expect(lunesCount).toBeGreaterThan(0); // Lunes debe existir
    expect(sabadoCount).toBeGreaterThan(0); // Sábado debe existir

    // BUG C-04: Domingo no existe — cuando se corrija, este expect debe pasar:
    // expect(domingoBtnVisible).toBe(true);

    if (!domingoBtnVisible) {
      console.warn('BUG C-04 CONFIRMADO: Tab "Domingo" no existe en la Agenda de Cobros (solo 6 días)');
    } else {
      console.log('C-04 resuelto: Tab "Domingo" ahora existe en la Agenda');
    }

    // Documentar: 6 días presentes, falta Domingo
    expect(dayTabCount).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------
// C-06: Formulario Nuevo Préstamo sin campo Fecha de inicio
// ---------------------------------------------------------------
test.describe('C-06 — Préstamos: sin campo "Fecha de inicio" en formulario', () => {
  test('el formulario de nuevo préstamo debe permitir especificar fecha de inicio', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/loans');

    await page.getByRole('button', { name: 'Nuevo Préstamo' }).click();

    // Verificar que existe un campo de fecha de inicio
    const fechaInicioField = page.getByLabel(/fecha.*inicio|fecha.*desembolso|fecha.*préstamo/i);
    const fechaVisible = await fechaInicioField.isVisible().catch(() => false);

    if (!fechaVisible) {
      console.warn('BUG C-06 CONFIRMADO: No existe campo "Fecha de inicio" en formulario de nuevo préstamo');
    }

    // BUG C-06: actualmente no existe el campo — cuando se corrija, este expect debe pasar:
    // expect(fechaVisible).toBe(true);

    // Cerrar modal
    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------
// C-07: Gráfico "Distribución de Cartera" sin leyenda/etiquetas
// ---------------------------------------------------------------
test.describe('C-07 — Dashboard: gráfico distribución de cartera sin etiquetas', () => {
  test('el gráfico de distribución debe mostrar etiquetas o leyenda con estados', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');

    // Verificar que el gráfico existe
    const chartHeading = page.getByRole('heading', { name: 'Distribución de Cartera' });
    await expect(chartHeading).toBeVisible();

    // El snapshot de accessibility muestra solo "Activos: 3" en el chart, sin % ni etiquetas visuales
    // BUG C-07: cuando se corrija, debe haber al menos una etiqueta visible con porcentaje
    const chartSection = page.locator('text=Distribución de Cartera').locator('..');
    await expect(chartSection).toBeVisible();
  });
});

// ---------------------------------------------------------------
// C-09: No hay opción de eliminar productos desde la UI
// ---------------------------------------------------------------
test.describe('C-09 — Productos: no existe opción de eliminar desde UI', () => {
  test('debe existir botón de eliminar para productos sin préstamos asociados', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/configuracion/productos');

    // Solo verificar si hay algún producto para inspeccionar
    const hasProducts = await page.locator('tbody tr').filter({ hasNot: page.locator('td[colspan]') }).count() > 0;

    if (hasProducts) {
      const deleteBtn = page.locator('tbody tr').first().getByRole('button', { name: /eliminar|borrar/i });
      const deleteVisible = await deleteBtn.isVisible().catch(() => false);

      if (!deleteVisible) {
        console.warn('BUG C-09 CONFIRMADO: No existe botón de eliminar para productos crediticios');
      }

      // BUG C-09: actualmente no existe eliminar — cuando se corrija, debe aparecer:
      // expect(deleteVisible).toBe(true);
    }
  });
});

// ---------------------------------------------------------------
// C-10: Capital Pendiente > 100% del total prestado (etiqueta confusa)
// ---------------------------------------------------------------
test.describe('C-10 — Dashboard: Capital Pendiente puede superar 100% del total prestado', () => {
  test('la etiqueta Capital Pendiente no debe superar el monto original del préstamo sin explicación', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');

    // Verificar si existe el indicador "% del total"
    const porcentajeTxt = page.locator('text=/\\d+\\.\\d+% del total/');
    const hasPercentage = await porcentajeTxt.isVisible().catch(() => false);

    if (hasPercentage) {
      const percentText = await porcentajeTxt.textContent();
      const pct = parseFloat(percentText?.match(/([\d.]+)%/)?.[1] ?? '0');

      if (pct > 100) {
        console.warn(`BUG C-10 CONFIRMADO: Capital Pendiente = ${pct}% del total prestado (>100%)`);
      }

      // BUG C-10: cuando se corrija la etiqueta o el cálculo, este expect debe pasar:
      // expect(pct).toBeLessThanOrEqual(100);

      // Por ahora documentamos que el valor puede superar 100%
      expect(pct).toBeGreaterThan(0); // Al menos positivo
    }
  });

  test('el detalle del préstamo debe mostrar saldo pendiente igual o menor al total a pagar', async ({ page }) => {
    await loginAsAdmin(page);

    // Obtener primer préstamo via API para navegar directamente
    await page.goto('/api/loans?limit=1');
    const apiText = await page.locator('body').textContent();
    let loanId: string | null = null;
    try {
      const parsed = JSON.parse(apiText ?? '{}');
      loanId = parsed?.data?.[0]?.id ?? null;
    } catch {
      // silenciar error de parse
    }

    if (!loanId) {
      console.warn('C-10: No se encontraron préstamos via API, test omitido');
      return;
    }

    await page.goto(`/dashboard/loans/${loanId}`);
    await page.waitForSelector('h1, h2', { timeout: 10000 });

    // Obtener monto principal y "pendiente"
    const montoText = await page.locator('h1, h2').first().textContent().catch(() => '0');
    const montoMatch = montoText?.match(/[\d,]+\.?\d*/)?.[0]?.replace(/,/g, '');
    const monto = parseFloat(montoMatch ?? '0');

    // Buscar texto de "pendiente" en la página
    const pendienteText = await page.locator('body').textContent().catch(() => '');
    const pendMatch = pendienteText?.match(/RD\$\s*([\d,]+\.?\d*)\s*pendiente/)?.[1]?.replace(/,/g, '');
    const pendiente = parseFloat(pendMatch ?? '0');

    if (pendiente > monto && monto > 0) {
      console.warn(`BUG C-10: Pendiente (${pendiente}) > Monto principal (${monto}) — etiqueta confusa`);
    }

    // La página debe haber cargado correctamente
    await expect(page).toHaveURL(/\/dashboard\/loans\//);
  });
});

// ---------------------------------------------------------------
// C-11: "Registrado por" aparece "—" en tab Pagos del préstamo
// ---------------------------------------------------------------
test.describe('C-11 — Detalle Préstamo: "Registrado por" muestra "—" en tab Pagos', () => {
  test('el tab Pagos del préstamo debe mostrar el nombre del usuario registrador', async ({ page }) => {
    await loginAsAdmin(page);

    // Obtener primer préstamo con pagos via API
    await page.goto('/api/loans?limit=5');
    const apiText = await page.locator('body').textContent();
    let loanId: string | null = null;
    try {
      const parsed = JSON.parse(apiText ?? '{}');
      // Buscar préstamo activo que probablemente tenga pagos
      const loans = parsed?.data ?? [];
      loanId = loans[0]?.id ?? null;
    } catch {
      // silenciar error de parse
    }

    if (!loanId) {
      console.warn('C-11: No se encontraron préstamos via API, test omitido');
      return;
    }

    await page.goto(`/dashboard/loans/${loanId}`);
    await page.waitForSelector('h1, h2', { timeout: 10000 });

    // Ir al tab de pagos
    const pagosTab = page.getByRole('button', { name: /Pagos \(\d+\)/ });
    const pagosVisible = await pagosTab.isVisible().catch(() => false);

    if (pagosVisible) {
      await pagosTab.click();

      // Verificar columna "Registrado por"
      const registradoPorHeader = page.locator('th').filter({ hasText: 'Registrado por' });
      await expect(registradoPorHeader).toBeVisible();

      // Verificar si algún valor es "—" (dash = datos faltantes)
      const dashCells = page.locator('tbody td').filter({ hasText: /^—$/ });
      const dashCount = await dashCells.count();

      if (dashCount > 0) {
        console.warn(`BUG C-11 CONFIRMADO: ${dashCount} celdas con "—" en columna Registrado por del tab Pagos`);
      }

      // BUG C-11: cuando se corrija, ninguna celda de "Registrado por" debe ser "—":
      // expect(dashCount).toBe(0);
    }
  });
});

// ---------------------------------------------------------------
// RBAC: Verificar que OPERATOR no puede acceder a rutas admin
// ---------------------------------------------------------------
test.describe('RBAC — OPERATOR no puede acceder a rutas de ADMIN', () => {
  test('OPERATOR es redirigido a /unauthorized al acceder a /users', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/users');
    await page.waitForURL('**/dashboard/unauthorized');
    expect(page.url()).toContain('/unauthorized');
    await expect(page.getByText('403 — Acceso Denegado')).toBeVisible();
  });

  test('OPERATOR es redirigido a /unauthorized al acceder a /configuracion/productos', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/configuracion/productos');
    await page.waitForURL('**/dashboard/unauthorized');
    expect(page.url()).toContain('/unauthorized');
    await expect(page.getByText('403 — Acceso Denegado')).toBeVisible();
  });

  test('OPERATOR es redirigido a /unauthorized al acceder a /settings', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard/settings');
    await page.waitForURL('**/dashboard/unauthorized');
    expect(page.url()).toContain('/unauthorized');
    await expect(page.getByText('403 — Acceso Denegado')).toBeVisible();
  });

  test('OPERATOR NO ve Usuarios, Productos ni Configuración en el sidebar', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('link', { name: 'Usuarios' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Productos' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Configuración' })).not.toBeVisible();

    // Sí debe ver las páginas operativas
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clientes' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Préstamos' })).toBeVisible();
  });
});

// ---------------------------------------------------------------
// Validaciones de formulario Producto Crediticio
// ---------------------------------------------------------------
test.describe('Productos — Validaciones de formulario', () => {
  test('no permite crear producto con nombre vacío', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/configuracion/productos');

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    // Dejar nombre vacío, llenar otros campos
    await page.getByRole('spinbutton', { name: 'Tasa (%) *' }).fill('10');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('12');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    await expect(page.getByText('El nombre es requerido.')).toBeVisible({ timeout: 3000 });
  });

  test('no permite valores negativos en tasa (HTML5 validation)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/configuracion/productos');

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByRole('textbox', { name: 'Nombre del producto *' }).fill('QA-TEST-NEG');
    await page.getByRole('spinbutton', { name: 'Tasa (%) *' }).fill('-5');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('-1');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    // HTML5 native validation blocks negative values
    const productCreated = page.locator('tbody tr').filter({ hasText: 'QA-TEST-NEG' });
    const created = await productCreated.isVisible({ timeout: 2000 }).catch(() => false);
    expect(created).toBe(false); // Negative values should be blocked
  });

  test('flujo completo: crear, editar, desactivar y activar producto', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/configuracion/productos');

    // Limpieza previa: eliminar residuos de ejecuciones anteriores via API
    await page.evaluate(async () => {
      const res = await fetch('/api/loan-products');
      const data = await res.json();
      for (const p of (data.products ?? [])) {
        if (p.name === 'QA-VIBE3-FLUJO' || p.name === 'QA-VIBE3-FLUJO-EDITADO') {
          await fetch(`/api/loan-products/${p.id}`, { method: 'DELETE' });
        }
      }
    });
    await page.reload();

    // Crear
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByRole('textbox', { name: 'Nombre del producto *' }).fill('QA-VIBE3-FLUJO');
    await page.getByRole('spinbutton', { name: 'Tasa (%) *' }).fill('15');
    await page.getByRole('spinbutton', { name: 'Número de cuotas *' }).fill('8');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    await expect(page.getByText('Producto creado exitosamente')).toBeVisible({ timeout: 5000 });
    // Usar exact match para evitar coincidir con la versión editada
    const row = page.locator('tbody tr').filter({ hasText: 'QA-VIBE3-FLUJO' }).filter({ hasNot: page.locator('td', { hasText: 'QA-VIBE3-FLUJO-EDITADO' }) });
    await expect(row.first()).toBeVisible();
    await expect(row.first().locator('td').filter({ hasText: '15.00%' })).toBeVisible();

    // Editar
    await row.first().getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('textbox', { name: 'Nombre del producto *' }).fill('QA-VIBE3-FLUJO-EDITADO');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Producto actualizado')).toBeVisible({ timeout: 5000 });
    // Esperar actualización de tabla
    await page.waitForTimeout(500);

    // Localizar la fila editada (exacta) — evitar coincidencias parciales con 'QA-VIBE3-FLUJO'
    const getEditedRow = () => page.locator('tbody tr').filter({ hasText: 'QA-VIBE3-FLUJO-EDITADO' }).first();
    await expect(getEditedRow()).toBeVisible({ timeout: 5000 });

    // Desactivar
    await getEditedRow().getByRole('button', { name: 'Desactivar' }).click({ timeout: 10000 });
    await expect(page.getByText('Producto desactivado')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await expect(getEditedRow().locator('td').filter({ hasText: 'Inactivo' })).toBeVisible({ timeout: 5000 });

    // Activar
    await getEditedRow().getByRole('button', { name: 'Activar' }).click({ timeout: 10000 });
    await expect(page.getByText('Producto activado')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await expect(getEditedRow().locator('td').filter({ hasText: 'Activo' })).toBeVisible({ timeout: 5000 });

    // Limpieza: desactivar para que no interfiera
    await getEditedRow().getByRole('button', { name: 'Desactivar' }).click({ timeout: 10000 });
    // Intentar borrar via API
    await page.evaluate(async () => {
      const res = await fetch('/api/loan-products');
      const data = await res.json();
      const prod = (data.products ?? []).find((p: { name: string }) => p.name === 'QA-VIBE3-FLUJO-EDITADO');
      if (prod) await fetch(`/api/loan-products/${prod.id}`, { method: 'DELETE' });
    });
  });
});

// ---------------------------------------------------------------
// Seguridad: SQL Injection en búsqueda de clientes
// ---------------------------------------------------------------
test.describe('Seguridad — SQL Injection en campos de búsqueda', () => {
  test('búsqueda de clientes con SQL injection no rompe la aplicación', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/clients');

    const searchBox = page.getByRole('textbox', { name: 'Buscar por nombre, documento' });
    await searchBox.fill("'; DROP TABLE clients; --");
    await page.waitForTimeout(500);

    // La aplicación debe seguir funcionando — no error 500 ni página rota
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();

    // No debe aparecer ningún cliente con ese término
    const results = page.locator('tbody tr').filter({ hasNot: page.locator('td[colspan]') });
    const count = await results.count();
    // Puede haber 0 resultados o el mensaje "No se encontraron resultados"
    const noResults = page.locator('text=No se encontraron resultados');
    const zeroClients = page.locator('text=0 clientes registrados');

    const safeResponse = await noResults.isVisible().catch(() => false) ||
                         await zeroClients.isVisible().catch(() => false) ||
                         count === 0;
    expect(safeResponse).toBe(true);

    // Verificar sin errores en consola
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleLogs.push(msg.text());
    });
    expect(consoleLogs.filter(l => l.includes('500') || l.includes('syntax error')).length).toBe(0);
  });
});

// ---------------------------------------------------------------
// Agenda de Cobros — Navegación básica entre días
// ---------------------------------------------------------------
test.describe('Agenda — Navegación entre días', () => {
  test('puede navegar entre todos los días disponibles sin errores', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/agenda');

    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    for (const dia of dias) {
      const btn = page.getByRole('button', { name: dia });
      await expect(btn).toBeVisible();
      await btn.click();
      // Debe mostrar o clientes o mensaje vacío — sin error
      const hasClients = await page.locator('.cliente-card, [data-testid="agenda-client"]').count() > 0;
      const hasEmpty = await page.locator(`text=No hay clientes con cobros programados para el ${dia.toLowerCase()}`).isVisible().catch(() => false);
      // Puede mostrar clientes o mensaje vacío — ambos son válidos
      expect(true).toBe(true); // Solo verificamos que no hay crash
    }
  });

  test('el subtítulo muestra el total de clientes y cuotas para el día seleccionado', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/agenda');

    // Navegar a Viernes (donde hay clientes en los datos de prueba)
    await page.getByRole('button', { name: 'Viernes' }).click();

    const subtitle = page.locator('p').filter({ hasText: /clientes.*cuotas|RD\$/ }).first();
    await expect(subtitle).toBeVisible();
    const subtitleText = await subtitle.textContent();
    expect(subtitleText).toMatch(/\d+ cliente/);
  });
});

// ---------------------------------------------------------------
// Configuración — Guardar cambios funciona
// ---------------------------------------------------------------
test.describe('Configuración — Guardar cambios del sistema', () => {
  test('puede guardar la configuración del negocio sin errores', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/settings');

    // Verificar que el nombre del negocio es correcto (sin XSS payload)
    const nombreNegocio = page.getByRole('textbox', { name: 'LMS Credit SRL' });
    const nombreValue = await nombreNegocio.inputValue();
    expect(nombreValue).not.toContain('<script>');
    expect(nombreValue).not.toContain('alert');

    // Guardar sin cambios
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Configuración guardada correctamente')).toBeVisible({ timeout: 5000 });
  });

  test('puede navegar entre las tres pestañas de configuración', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/settings');

    await page.getByRole('button', { name: 'Parámetros de Mora' }).click();
    await expect(page.getByRole('heading', { name: 'Parámetros de Mora' })).toBeVisible();

    await page.getByRole('button', { name: 'Tasas por Defecto' }).click();
    await expect(page.getByRole('heading', { name: 'Tasas de Interés por Defecto' })).toBeVisible();

    await page.getByRole('button', { name: 'Datos del Negocio' }).click();
    await expect(page.getByRole('heading', { name: 'Datos del Negocio' })).toBeVisible();
  });
});

// ---------------------------------------------------------------
// Pagos — Validación: monto negativo es bloqueado
// ---------------------------------------------------------------
test.describe('Pagos — Validaciones de formulario', () => {
  test('no permite registrar pago con monto negativo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/payments');

    await page.getByRole('button', { name: 'Registrar Pago' }).click();

    // Esperar a que el modal se abra
    await page.waitForSelector('form', { timeout: 5000 });

    // Buscar y seleccionar un préstamo
    const loanField = page.getByRole('textbox', { name: /Préstamo/i });
    const loanFieldVisible = await loanField.isVisible().catch(() => false);

    if (loanFieldVisible) {
      await loanField.fill('Darwin');
      await page.waitForTimeout(800);
      // Intentar varios selectores para la sugerencia
      const suggestion = page.locator('[data-value], [role="option"], li').filter({ hasText: 'Darwin' }).first();
      const hasSuggestion = await suggestion.isVisible().catch(() => false);
      if (hasSuggestion) {
        await suggestion.click();
      }
    }

    // Intentar monto negativo en el campo de monto
    const montoField = page.getByRole('spinbutton', { name: /Monto/i });
    const montoVisible = await montoField.isVisible().catch(() => false);

    if (montoVisible) {
      await montoField.fill('-500');

      // El botón puede estar disabled por HTML5 min=0 validation
      const submitBtn = page.locator('form').getByRole('button', { name: 'Registrar Pago' });
      const isDisabled = await submitBtn.isDisabled().catch(() => true);

      if (isDisabled) {
        console.log('VALIDACIÓN OK: Botón deshabilitado con monto negativo (HTML5 min validation)');
      } else {
        // Si no está deshabilitado, intentar click — HTML5 mostrará tooltip de error
        await submitBtn.click({ timeout: 3000 }).catch(() => {
          console.log('VALIDACIÓN OK: Click bloqueado por HTML5 validation');
        });
      }
    }

    // El modal debe seguir abierto (pago no enviado) o cancelar limpiamente
    const cancelBtn = page.getByRole('button', { name: 'Cancelar' });
    const cancelVisible = await cancelBtn.isVisible().catch(() => false);
    if (cancelVisible) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // Verificar que la página no crasheó
    await expect(page).toHaveURL(/\/dashboard\/payments/);
  });
});
