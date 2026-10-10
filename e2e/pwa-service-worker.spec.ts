import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'allow' });

test('service worker only stores public assets and serves an offline document', async ({ page, context, browserName }, info) => {
  await page.goto('/login');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)))).flat();
  });
  expect(cached.sort()).toEqual(['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'].sort());
  await context.setOffline(true);
  const navigationError = await page.goto('/dashboard/clientes').then(() => null, (error: Error) => error);
  if (navigationError) {
    expect(browserName).toBe('webkit');
    expect(navigationError.message).toContain('WebKit encountered an internal error');
    info.annotations.push({ type: 'limitation', description: 'WebKit offline emulation rejected navigation before the fallback rendered. Public cache contents were verified.' });
  } else {
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  }
  await expect(page.locator('.layout-container')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Ana Prueba');
  await context.setOffline(false);
});
