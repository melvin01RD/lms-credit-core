import { test, expect, Page, Request } from '@playwright/test';
import jwt from 'jsonwebtoken';

const user = { userId: 'test-user', firstName: 'Usuario', lastName: 'Controlado', email: 'test@example.test', role: 'OPERATOR' };
const token = () => jwt.sign({ ...user, lastActivity: Math.floor(Date.now() / 1000) }, 'bug-login-001-local-test-secret-not-a-real-credential', { expiresIn: '11m' });
const metrics = {
  totalLoaned: 1000, totalOutstanding: 500, totalInterest: 100, totalLateFees: 0, overdueAmount: 0,
  activeClients: 1, activeLoans: 1, overdueLoans: 0, paidLoans: 0, paymentsThisMonth: 1, paymentsThisMonthAmount: 100,
  loansByMonth: [], paymentsByMonth: [], portfolioDistribution: [], upcomingPayments: [],
};
type AuthEvent = { path: string; method: string; started: number; ended?: number; status?: number; failure?: string };
const logs = new WeakMap<Page, AuthEvent[]>();
const navigations = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }, info) => {
  test.skip(!info.config.configFile?.endsWith('playwright.login-002.config.ts'),
    'Run with playwright.login-002.config.ts: this suite requires the isolated JWT test server.');
  const requests = new Map<Request, AuthEvent>();
  const events: AuthEvent[] = [];
  const paths: string[] = [];
  logs.set(page, events); navigations.set(page, paths);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!/^\/api\/auth\/(login|logout|me)$/.test(path)) return;
    const event = { path, method: request.method(), started: Date.now() };
    events.push(event); requests.set(request, event);
  });
  page.on('response', response => { const event = requests.get(response.request()); if (event) { event.status = response.status(); event.ended = Date.now(); } });
  page.on('requestfailed', request => { const event = requests.get(request); if (event) { event.failure = request.failure()?.errorText; event.ended = Date.now(); } });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname); });
  // Only credentials and business data are fixtures. /me and /logout use real local endpoints.
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/login') return route.fulfill({ json: { user }, headers: { 'set-cookie': `lms_session=${token()}; Path=/; HttpOnly; SameSite=Lax` } });
    if (path === '/api/auth/me' || path === '/api/auth/logout') return route.continue();
    if (path === '/api/reports/dashboard') return route.fulfill({ json: metrics });
    if (path === '/api/dashboard/flat-rate') return route.fulfill({ json: { cobrosHoy: 0, cuotasVencidas: 0, montoVencido: 0, carteraActiva: 1000, prestamosActivos: 1 } });
    return route.fulfill({ status: 503, json: { error: { message: 'Isolated test fixture' } } });
  });
});

test.afterEach(async ({ page }, info) => {
  await info.attach('auth-network.json', { body: JSON.stringify({ requests: logs.get(page), navigations: navigations.get(page) }, null, 2), contentType: 'application/json' });
});

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('ControlledPassword123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  // The first development request also compiles dashboard and /me.
  await expect(page.getByRole('heading', { name: 'Dashboard Ejecutivo' })).toBeVisible({ timeout: 20000 });
}
async function logoutButton(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole('button', { name: 'Cerrar sesión', exact: true });
}
const calls = (page: Page, name: string) => logs.get(page)!.filter(event => event.path === `/api/auth/${name}`);
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test.describe('SSR styling', () => {
  test.use({ javaScriptEnabled: false });
  test('login has its design before hydration', async ({ page }, info) => {
    await page.goto('/login');
    await page.screenshot({ path: info.outputPath('login-before-hydration.png') });
    await expect(page.locator('.login-container')).toHaveCSS('display', 'flex');
    await expect(page.locator('.form-submit')).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  });
});

test('TC-LOGIN-001: successful login keeps a single request and navigation', async ({ page }) => {
  await login(page);
  expect(calls(page, 'login')).toHaveLength(1);
  expect(calls(page, 'me').filter(event => event.status === 200)).toHaveLength(1);
  expect(navigations.get(page)!.filter(path => path === '/dashboard')).toHaveLength(1);
});

test('TC-LOGIN-002: video sequence keeps logout destination styled before hydration', async ({ page, context }, info) => {
  await login(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.route('**/_next/**', route => {
    // Let the document finish loading while withholding hydration itself.
    // Holding script requests open also holds document.fonts.ready/screenshots.
    if (route.request().resourceType() === 'script') return route.fulfill({ contentType: 'application/javascript', body: '' });
    return route.continue();
  });
    await (await logoutButton(page)).click({ noWaitAfter: true });
    await expect(page.locator('.login-container')).toBeVisible();
    await page.screenshot({ path: info.outputPath('logout-before-hydration.png') });
    await expect(page.locator('.login-container')).toHaveCSS('display', 'flex');
    await expect(page.locator('.form-submit')).toHaveCSS('background-color', 'rgb(37, 99, 235)');
    await expect(page.locator('.layout-container')).toHaveCount(0);
    expect(calls(page, 'logout')).toHaveLength(1);
    expect((await context.cookies()).find(cookie => cookie.name === 'lms_session')).toBeUndefined();
    expect((await context.request.get('/api/auth/me')).status()).toBe(401);
});

test('TC-LOGIN-003: five consecutive login/logout cycles', async ({ page, context }) => {
  for (let cycle = 0; cycle < 5; cycle++) {
    await login(page);
    await (await logoutButton(page)).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.login-container')).toHaveCSS('display', 'flex');
    await expect(page.locator('.layout-container')).toHaveCount(0);
    expect((await context.cookies()).some(cookie => cookie.name === 'lms_session')).toBe(false);
  }
  expect(calls(page, 'login')).toHaveLength(5);
  expect(calls(page, 'logout')).toHaveLength(5);
});

test('TC-LOGIN-004: Back and direct access after logout reveal no private content', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard?history=1');
  await expect(page.locator('.layout-container')).toBeVisible();
  await (await logoutButton(page)).click();
  await expect(page).toHaveURL(/\/login$/);
  // Observe every DOM insertion while history restores an older protected entry.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector('.layout-container')) sessionStorage.setItem('private-after-logout', 'yes');
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.layout-container')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('private-after-logout'))).toBeNull();
  expect(calls(page, 'logout')).toHaveLength(1);
});

test('TC-LOGIN-005: manual logout does not race the inactivity deadline', async ({ page }) => {
  await page.clock.install();
  await login(page);
  await page.clock.fastForward(9 * 60 * 1000);
  const navigationCount = navigations.get(page)!.length;
  const pending = gate();
  await page.route('**/api/auth/logout', async route => { await pending.promise; await route.fallback(); });
  try {
    const button = await logoutButton(page);
    await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
    await expect(page.getByRole('status')).toContainText('Cerrando sesión');
    await page.clock.fastForward(11 * 60 * 1000);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('online')); });
    expect(calls(page, 'logout')).toHaveLength(1);
    await expect(page.locator('.layout-container')).toHaveCount(0);
  } finally { pending.release(); }
  await expect(page).toHaveURL(/\/login$/);
  expect(navigations.get(page)!.slice(navigationCount).filter(path => path === '/login')).toHaveLength(1);
});

test('TC-LOGIN-006: latency preserves pending states through requests and navigation', async ({ page }) => {
  const signingIn = gate(), checking = gate(), signingOut = gate(), destination = gate();
  await page.route('**/api/auth/login', async route => { await signingIn.promise; await route.fallback(); });
  await page.route('**/api/auth/me', async route => { await checking.promise; await route.fallback(); });
  await page.route('**/api/auth/logout', async route => { await signingOut.promise; await route.fallback(); });
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('ControlledPassword123');
  try {
    await page.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
    await expect(page.getByRole('button', { name: 'Iniciando sesión' })).toBeDisabled();
    await expect.poll(() => calls(page, 'login').length).toBe(1);
    signingIn.release();
    await expect(page.getByRole('status')).toContainText('Verificando sesión');
    await expect(page.locator('.layout-container')).toHaveCount(0);
    checking.release();
    await expect(page.getByRole('heading', { name: 'Dashboard Ejecutivo' })).toBeVisible();
    await page.route('**/login', async route => { await destination.promise; await route.continue(); });
    await (await logoutButton(page)).click({ noWaitAfter: true });
    await expect(page.getByRole('status')).toContainText('Cerrando sesión');
    await expect(page.locator('.layout-container')).toHaveCount(0);
    await page.evaluate(() => {
      const capture = () => sessionStorage.setItem('logout-exit-state', JSON.stringify({
        message: document.querySelector('[role="status"]')?.textContent,
        privateContent: !!document.querySelector('.layout-container'),
      }));
      window.addEventListener('beforeunload', capture);
      window.addEventListener('pagehide', capture);
    });
    signingOut.release();
    await expect.poll(() => calls(page, 'logout')[0]?.status).toBe(200);
    expect(calls(page, 'logout')).toHaveLength(1);
  } finally { signingIn.release(); checking.release(); signingOut.release(); destination.release(); }
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.login-container')).toHaveCSS('display', 'flex');
  // Chromium suspends evaluation in the outgoing document during navigation.
  // Read its lifecycle snapshot from the destination instead of blocking on it.
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('logout-exit-state')!)))
    .toEqual({ message: 'LMS Credit CoreCerrando sesión…', privateContent: false });
});

test('network failure during logout permits an explicit retry without restoring private data', async ({ page, context }) => {
  await login(page);
  await page.route('**/api/auth/logout', route => route.abort('failed'));
  await (await logoutButton(page)).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo confirmar' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.layout-container')).toHaveCount(0);
  expect(calls(page, 'logout')).toHaveLength(1);
  expect((await context.cookies()).some(cookie => cookie.name === 'lms_session')).toBe(true);
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls(page, 'logout')).toHaveLength(2);
  expect((await context.cookies()).some(cookie => cookie.name === 'lms_session')).toBe(false);
});
