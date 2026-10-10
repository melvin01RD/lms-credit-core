import { test, expect, Page } from '@playwright/test';

// Browser contract tests: every API is intercepted. No database or real users.
test.use({ serviceWorkers: 'block' });
const client = { id: 'client-test', firstName: 'Ana', lastName: 'Prueba', documentId: '00100000008', phone: '8095550123', email: 'ana@example.test', address: 'Calle de prueba', currency: 'DOP', active: true, collectionDays: ['MONDAY'], createdAt: '2026-10-01', updatedAt: '2026-10-01' };
const user = { userId: 'user-test', firstName: 'Operador', lastName: 'Prueba', email: 'operator@example.test', role: 'OPERATOR' };
const loan = { id: 'loan-test', clientId: client.id, client, principalAmount: '10000', totalFinanceCharge: '2000', totalPayableAmount: '12000', installmentAmount: '1500', remainingCapital: '12000', termCount: 8, installmentsPaid: 0, paymentFrequency: 'WEEKLY', status: 'ACTIVE', nextDueDate: '2026-10-10', createdAt: '2026-10-01', updatedAt: '2026-10-01', createdBy: user, updatedBy: null, payments: [], paymentSchedule: [] };
const pagination = { total: 1, page: 1, limit: 15, totalPages: 1, hasNext: false, hasPrev: false };

async function fixtures(page: Page) {
  Object.assign(client, { _count: { loans: 1 } });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let body: unknown = {};
    if (pathname === '/api/auth/me') body = { user };
    else if (pathname === '/api/clients/search') body = [client];
    else if (pathname === '/api/clients') body = route.request().method() === 'POST' ? client : { data: [client], pagination };
    else if (pathname === `/api/clients/${client.id}`) body = { ...client, loans: [loan] };
    else if (pathname === `/api/clients/${client.id}/loans`) body = [loan];
    else if (pathname === '/api/loans') body = route.request().method() === 'POST' ? loan : { data: [loan], pagination };
    else if (pathname === `/api/loans/${loan.id}`) body = loan;
    else if (pathname.endsWith('/amortization')) body = [{ installmentNumber: 1, dueDate: '2026-10-10', totalPayment: 1500, principalPayment: 1250, interestPayment: 250, remainingBalance: 10750 }];
    else if (pathname.endsWith('/summary')) body = { principalAmount: 10000, remainingCapital: 12000, capitalPaid: 0, interestPaid: 0, lateFeesPaid: 0, totalPaid: 0, paymentCount: 0, progressPercentage: 0 };
    else if (pathname === '/api/payments') body = { data: [], pagination: { ...pagination, total: 0 } };
    else if (pathname === '/api/agenda') body = { day: 'MONDAY', clients: [{ ...client, loans: [loan] }] };
    else if (pathname === '/api/loan-products') body = [];
    else if (pathname === '/api/reports/dashboard') body = { totalLoaned: 10000, totalOutstanding: 12000, totalInterest: 2000, totalLateFees: 0, overdueAmount: 0, activeClients: 1, activeLoans: 1, overdueLoans: 0, paidLoans: 0, paymentsThisMonth: 0, paymentsThisMonthAmount: 0, loansByMonth: [], paymentsByMonth: [], portfolioDistribution: [], upcomingPayments: [] };
    else if (pathname === '/api/dashboard/flat-rate') body = { cobrosHoy: 0, cuotasVencidas: 0, montoVencido: 0, carteraActiva: 12000, prestamosActivos: 1 };
    else if (pathname.startsWith('/api/reports/')) return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\nControlled test document\n%%EOF' });
    else if (pathname === '/api/users' || pathname === '/api/settings') return route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
    return route.fulfill({ json: body });
  });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
test.beforeEach(async ({ page }) => fixtures(page));

test('login supports autofill and server-confirmed authentication', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'username');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
  await page.locator('#email').fill('operator@example.test');
  await page.locator('#password').fill('ControlledPass123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await noOverflow(page);
});

test('mobile navigation, safe touch targets and desktop regression', async ({ page }, info) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
  const mobile = info.project.name !== 'chromium';
  const nav = page.getByRole('navigation', { name: 'Navegación móvil' });
  if (mobile) {
    await expect(nav).toBeVisible();
    const link = nav.getByRole('link', { name: 'Clientes' });
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('.sidebar').getByRole('link', { name: 'Reportes', exact: true }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/);
  } else {
    await expect(nav).toBeHidden();
    await expect(page.locator('.sidebar')).toBeVisible();
  }
  await noOverflow(page);
  await page.screenshot({ path: `test-results/mobile-${info.project.name}.png`, fullPage: true });
});

test('create and edit clients with a telephone link', async ({ page }) => {
  await page.goto('/dashboard/clientes');
  await page.getByRole('button', { name: /Nuevo Cliente/i }).click();
  await page.locator('#firstName').fill('Ana');
  await page.locator('#lastName').fill('Prueba');
  await page.locator('#documentId').fill(client.documentId);
  await page.locator('#phone').fill(client.phone);
  await page.getByRole('button', { name: /Crear Cliente/i }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.locator('.btn-edit:visible').first().click();
  await page.locator('#edit-firstName').fill('Ana editada');
  await page.getByRole('button', { name: /Guardar/i }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.goto(`/dashboard/clientes/${client.id}`);
  await expect(page.locator('a[href="tel:8095550123"]')).toBeVisible();
  await noOverflow(page);
});

test('create loans and consult expandable amortization', async ({ page }, info) => {
  await page.goto('/dashboard/prestamos');
  await page.getByRole('button', { name: /Nuevo Préstamo/i }).click();
  await page.getByPlaceholder(/Buscar cliente/i).fill('Ana');
  await page.locator('.client-dropdown-item').first().click();
  await page.locator('#principalAmount').fill('10000');
  await page.locator('#totalFinanceCharge').fill('2000');
  await page.locator('#termCount').fill('8');
  await page.getByRole('button', { name: /Crear Préstamo/i }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.goto(`/dashboard/prestamos/${loan.id}`);
  await page.getByRole('button', { name: /Amortización/i }).click();
  if (info.project.name !== 'chromium') {
    await page.locator('.mobile-installments summary').click();
    await expect(page.locator('.mobile-installments')).toContainText('1,250.00');
  } else await expect(page.locator('.desktop-amortization')).toBeVisible();
  await noOverflow(page);
});

test('payment confirmation blocks duplicate taps until the server responds', async ({ page }) => {
  let count = 0;
  await page.route('**/api/payments', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    count++;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return route.fulfill({ status: 201, json: { payment: { id: 'payment-test' } } });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/dashboard/pagos?loanId=loan-test');
  await expect(page.getByRole('dialog')).toContainText('Ana');
  await page.locator('#totalAmount').fill('1500');
  const submit = page.getByRole('button', { name: 'Registrar Pago', exact: true }).last();
  await submit.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: 'Registrando...' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Pago registrado' })).toBeVisible();
  expect(count).toBe(1);
});

test('lost payment response requires checking payments before another submission', async ({ page }) => {
  let submissions = 0;
  await page.route('**/api/payments', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    submissions++;
    return route.abort();
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/dashboard/pagos?loanId=loan-test');
  await expect(page.getByRole('dialog')).toContainText('Ana');
  await page.locator('#totalAmount').fill('1500');
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar Pago', exact: true }).click();
  await expect(page.locator('.modal-error')).toContainText('conexión');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Registrar Pago', exact: true })).toBeDisabled();
  await expect(page.locator('.modal-error')).toContainText('consulta los pagos');
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('offline state blocks payment submission', async ({ page }) => {
  let submissions = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/payments') && request.method() === 'POST') submissions++; });
  await page.goto('/dashboard/pagos?loanId=loan-test');
  await expect(page.getByRole('dialog')).toContainText('Ana');
  await page.locator('#totalAmount').fill('1500');
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
  await expect(page.locator('.connectivity-banner')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar Pago', exact: true }).click();
  await expect(page.locator('.modal-error')).toContainText('Sin conexión');
  expect(submissions).toBe(0);
});

test('session expiry on resume removes protected content', async ({ page }) => {
  await page.goto('/dashboard/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: { code: 'SESSION_EXPIRED' } } }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toHaveCount(0);
});

test('operators cannot navigate to administration', async ({ page }) => {
  await page.goto('/dashboard/clientes');
  await expect(page.locator('.sidebar')).not.toContainText('Usuarios');
  await page.goto('/dashboard/usuarios');
  await expect(page).toHaveURL(/unauthorized/);
});

test('administration pages fit mobile screens and preserve desktop tables', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { ...user, role: 'ADMIN' } } }));
  await page.route('**/api/users?*', route => route.fulfill({ json: [{ ...user, id: 'admin-test', role: 'ADMIN', active: true,
    createdAt: '2026-10-01', _count: { createdLoans: 1, payments: 1 } }] }));
  await page.route('**/api/settings', route => route.fulfill({ json: { businessName: 'Negocio de prueba', lateFeeValue: 5 } }));
  await page.route('**/api/loan-products?*', route => route.fulfill({ json: [{ id: 'product-test', name: 'Producto de prueba',
    defaultRate: 10, paymentFrequency: 'WEEKLY', termCount: 8, active: true, minAmount: 1000, maxAmount: 10000 }] }));
  for (const route of ['usuarios', 'configuracion', 'configuracion/productos']) {
    await page.goto(`/dashboard/${route}`);
    await expect(page.locator('.main-content')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/dashboard/${route}$`));
    await expect(page.locator('.main-content h1')).toBeVisible();
    if (route === 'usuarios') await expect(page.locator('.main-content')).toContainText(user.email);
    if (route === 'configuracion/productos') await expect(page.getByText('Producto de prueba', { exact: true })).toBeVisible();
    if (route === 'configuracion') await expect(page.getByRole('textbox').first()).toHaveValue('Negocio de prueba');
    await noOverflow(page);
  }
});

test('reports, agenda payment shortcut and manifest remain accessible', async ({ page, request }) => {
  await page.goto('/dashboard/reportes'); await noOverflow(page);
  await page.goto('/dashboard/agenda');
  await expect(page.getByRole('link', { name: 'Registrar pago', exact: true })).toHaveAttribute('href', '/dashboard/pagos?loanId=loan-test');
  await noOverflow(page);
  const response = await request.get('/manifest.webmanifest');
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone'); expect(manifest.icons).toHaveLength(3);
  const offline = await request.get('/offline.html'); expect(await offline.text()).toContain('Sin conexión');
});

test('PDF download and preview work after asynchronous generation', async ({ page }) => {
  await page.goto('/dashboard/reportes/plan-pagos');
  await page.getByPlaceholder('Buscar por nombre o cedula...').fill('Ana');
  await page.locator('.dropdown-item').first().click();
  await page.locator('.loan-item').first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await noOverflow(page);
});
