import { test, expect, Page } from '@playwright/test';
import jwt from 'jsonwebtoken';

const user = { userId: 'test-user', firstName: 'Usuario', lastName: 'Controlado', email: 'test@example.test', role: 'OPERATOR' };
const testSecret = 'bug-login-001-local-test-secret-not-a-real-credential';
const sessionToken = (lastActivity = Math.floor(Date.now() / 1000)) => jwt.sign({ ...user, lastActivity }, testSecret, { expiresIn: '11m' });
async function mockSession(page: Page) {
  let authenticated = true;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (path === '/api/auth/logout') { authenticated = false; return route.fulfill({ json: { message: 'Sesión cerrada' } }); }
    if (path === '/api/auth/me') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? { user } : { error: { code: 'NOT_AUTHENTICATED' } } });
    // Every other API stays isolated from the database.
    return route.fulfill({ status: 503, json: { error: { message: 'Controlled fixture' } } });
  });
}
async function enter(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill('test@example.test');
  await page.locator('#password').fill('ControlledPassword123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function logoutButton(page: Page) {
  if (await page.getByRole('button', { name: 'Abrir menú' }).isVisible()) await page.getByRole('button', { name: 'Abrir menú' }).click();
  return page.getByRole('button', { name: 'Cerrar sesión', exact: true });
}

test.beforeEach(async ({ page }) => mockSession(page));

test('login stays busy until navigation commits and replaces login history', async ({ page }) => {
  await page.goto('/login?history=anchor');
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/dashboard?*', async (route) => { await hold; await route.continue(); });
  await enter(page);
  await expect(page.locator('.form-submit')).toBeDisabled();
  release();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?history=anchor$/);
});

test('resume keeps the authenticated screen visible and coalesces checks', async ({ page }) => {
  await page.goto('/dashboard/unauthorized');
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  let checks = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/auth/me', async (route) => { checks++; await hold; await route.fulfill({ json: { user } }); });
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('pageshow')); });
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  await expect.poll(() => checks).toBe(1);
  release();
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
});

test('logout immediately hides private data and sends only one request', async ({ page }, info) => {
  await page.goto('/dashboard/unauthorized');
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  let calls = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/auth/logout', async (route) => { calls++; await hold; await route.fallback(); });
  const button = await logoutButton(page);
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toHaveCount(0);
  await expect.poll(() => calls).toBe(1);
  await page.screenshot({ path: info.outputPath('logout-transition.png') });
  release();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard/unauthorized');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.main-content')).toHaveCount(0);
});

test('expired session redirects once and never renders protected content', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: { code: 'SESSION_EXPIRED' } } }));
  let loginNavigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/login') loginNavigations++; });
  await page.goto('/dashboard/unauthorized');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('.main-content')).toHaveCount(0);
  expect(loginNavigations).toBe(1);
});

test('inactivity and resume trigger a single logout; activity resets the deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/dashboard/unauthorized');
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  let calls = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/auth/logout', async (route) => { calls++; await hold; await route.fallback(); });
  await page.clock.fastForward(9 * 60 * 1000);
  await page.evaluate(() => window.dispatchEvent(new Event('touchstart')));
  await page.clock.fastForward(9 * 60 * 1000);
  expect(calls).toBe(0);
  await page.clock.fastForward(61000);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('touchstart')); });
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(page).toHaveURL(/\/login\?reason=inactivity$/);
});

test('a late session response cannot restore private content after logout', async ({ page }) => {
  await page.goto('/dashboard/unauthorized');
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let checks = 0;
  await page.route('**/api/auth/me', async (route) => { checks++; await hold; await route.fulfill({ json: { user } }).catch(() => {}); });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => checks).toBe(1);
  await (await logoutButton(page)).click();
  await expect(page).toHaveURL(/\/login$/);
  release();
  await expect(page.locator('.main-content')).toHaveCount(0);
});

test('failed login and logout remain retryable without exposing private content', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => route.fulfill({ status: 401, json: { error: { message: 'Credenciales inválidas' } } }));
  await enter(page);
  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeEnabled();
  await page.goto('/dashboard/unauthorized');
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 503, json: {} }));
  await (await logoutButton(page)).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo confirmar' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.main-content')).toHaveCount(0);
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('logout synchronizes other tabs without a second POST', async ({ page, context }) => {
  const other = await context.newPage();
  await mockSession(other);
  await page.goto('/dashboard/unauthorized');
  await other.goto('/dashboard/unauthorized');
  await expect(other.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  let calls = 0;
  context.on('request', (request) => { if (new URL(request.url()).pathname === '/api/auth/logout') calls++; });
  await page.bringToFront();
  await (await logoutButton(page)).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(other).toHaveURL(/\/login$/);
  expect(calls).toBe(1);
});

test('real JWT cookies, RBAC and expiry are preserved without database access', async ({ context, request, baseURL }) => {
  expect((await request.get('/api/auth/me')).status()).toBe(401);
  await context.addCookies([{ name: 'lms_session', value: sessionToken(), url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
  const me = await context.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  expect(me.headers()['cache-control']).toContain('no-store');
  expect((await context.cookies()).find((cookie) => cookie.name === 'lms_session')?.httpOnly).toBe(true);
  expect((await context.request.get('/api/users')).status()).toBe(403);
  expect((await context.request.post('/api/auth/logout')).status()).toBe(200);
  expect((await context.cookies()).find((cookie) => cookie.name === 'lms_session')).toBeUndefined();
  expect((await context.request.get('/api/auth/me')).status()).toBe(401);
  await context.addCookies([{ name: 'lms_session', value: sessionToken(Math.floor(Date.now() / 1000) - 601), url: baseURL!, httpOnly: true }]);
  const expired = await context.request.get('/api/auth/me');
  expect(expired.status()).toBe(401);
  expect((await expired.json()).error.code).toBe('SESSION_EXPIRED');
});

test('real logout protects browser history without a service worker', async ({ page, context, baseURL }) => {
  await page.unroute('**/api/**');
  await context.addCookies([{ name: 'lms_session', value: sessionToken(), url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
  const response = await page.goto('/dashboard/unauthorized');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('.layout-container')).toBeVisible();
  await page.goto('/dashboard/unauthorized?history=1');
  await expect(page.locator('.layout-container')).toBeVisible();
  await (await logoutButton(page)).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some(cookie => cookie.name === 'lms_session')).toBe(false);
  expect((await context.request.get('/api/auth/me')).status()).toBe(401);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.layout-container')).toHaveCount(0);
});

test.describe('PWA with the real service worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('logout and offline history cannot recover private cached content', async ({ page, context, browserName, baseURL }, info) => {
    await page.unroute('**/api/**');
    await page.goto('/login');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.addCookies([{ name: 'lms_session', value: sessionToken(), url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
    // This protected page requires a real session but does not query business data.
    await page.goto('/dashboard/unauthorized');
    await expect(page.locator('.layout-container')).toBeVisible();
    await page.goto('/dashboard/unauthorized?history=1');
    await expect(page.locator('.layout-container')).toBeVisible();
    await (await logoutButton(page)).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get('/api/auth/me')).status()).toBe(401);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.layout-container')).toHaveCount(0);
    const paths = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)))).flat());
    expect(paths.sort()).toEqual(['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'].sort());
    await context.setOffline(true);
    const navigationError = await page.goto('/dashboard/unauthorized').then(() => null, (error: Error) => error);
    if (navigationError) {
      // WebKit's offline emulation can reject navigation before the SW runs.
      // Keep asserting privacy; do not claim its offline landing page was tested.
      expect(browserName).toBe('webkit');
      expect(navigationError.message).toContain('WebKit encountered an internal error');
      info.annotations.push({ type: 'limitation', description: 'WebKit offline navigation: https://github.com/microsoft/playwright/issues/42775. Private-cache checks passed; offline fallback could not render.' });
    } else {
      await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
    }
    await expect(page.locator('.layout-container')).toHaveCount(0);
    await context.setOffline(false);
  });
});

test('rapid login submissions share one request and keep the pending state', async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/auth/login', async (route) => { calls++; await hold; await route.fallback(); });
  await page.goto('/login');
  await page.locator('#email').fill('test@example.test');
  await page.locator('#password').fill('ControlledPassword123');
  await page.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: 'Iniciando sesión' })).toBeDisabled();
  release();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('a temporary revalidation error does not blank the screen or redirect', async ({ page }) => {
  await page.goto('/dashboard/unauthorized');
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 503, json: {} }));
  const response = page.waitForResponse('**/api/auth/me');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await response;
  await expect(page).toHaveURL(/\/dashboard\/unauthorized$/);
  await expect(page.getByRole('heading', { name: 'No tienes permiso para acceder a esta página', exact: true })).toBeVisible();
});
