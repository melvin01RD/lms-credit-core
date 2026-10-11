import { test, expect } from './fixtures/auth.fixture';
import { SESSION_COOKIE_NAME } from '../lib/config/session';
import { sessionState } from './qa/session';
test('AUTH-001 ADMIN dashboard and authorized backend', async ({ adminPage }) => {
  await adminPage.goto('/dashboard');
  await expect(adminPage).toHaveURL(/dashboard/);
  expect((await adminPage.request.get('/api/users')).status()).toBe(200);
});
test('AUTH-002 OPERATOR dashboard and clients', async ({ operatorPage }) => {
  await operatorPage.goto('/dashboard');
  await expect(operatorPage).toHaveURL(/dashboard/);
  expect((await operatorPage.request.get('/api/clients')).status()).toBe(200);
});
test('AUTH-003 OPERATOR backend role restrictions', async ({ operatorPage }) => {
  for (const route of ['/api/users', '/api/settings']) {
    const response = await operatorPage.request.get(route);
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
  }
  expect((await operatorPage.request.post('/api/loans/nonexistent/activate', { data: {} })).status()).toBe(403);
});
test('AUTH-004 anonymous access rejected', async ({ page }) => {
  expect((await page.request.get('/api/clients')).status()).toBe(401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
});
test('AUTH-005 invalid session rejected', async ({ page }) => {
  await page.context().addCookies([{ name: SESSION_COOKIE_NAME, value: 'invalid', url: 'http://127.0.0.1:3117' }]);
  expect((await page.request.get('/api/clients')).status()).toBe(401);
});
for (const age of ['expired', 'inactive'] as const) {
  test(`AUTH-005 ${age} session rejected`, async ({ page }) => {
    await page.context().addCookies((await sessionState('ADMIN', age)).cookies);
    const response = await page.request.get('/api/clients');
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe(age === 'inactive' ? 'SESSION_EXPIRED' : 'NOT_AUTHENTICATED');
  });
}
