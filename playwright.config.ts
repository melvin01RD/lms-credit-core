import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.test.local' });

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const isLocalhost = ['localhost', '127.0.0.1'].includes(new URL(BASE_URL).hostname);
if (!isLocalhost) throw new Error('Playwright requiere localhost para evitar operaciones sobre datos reales.');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    locale: 'es-DO',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    ...[{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }].map((viewport) => ({
      name: `android-${viewport.width}`, use: { ...devices['Pixel 5'], viewport },
    })),
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],

  ...(isLocalhost && {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }),
});
