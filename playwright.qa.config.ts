import { defineConfig, devices } from '@playwright/test';
const { baseURL, loadQA } = require('./e2e/qa/environment.cjs');
const env = loadQA();
export default defineConfig({
  testDir: './e2e', testMatch: ['qa-auth.spec.ts', 'financial-integrity.spec.ts'],
  globalSetup: './e2e/setup/auth.setup.ts', globalTeardown: './e2e/setup/auth.teardown.ts',
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: !!process.env.CI,
  timeout: 60000, expect: { timeout: 15000 }, reporter: [['list']],
  outputDir: 'test-results/qa',
  use: { baseURL, headless: true, trace: 'off', screenshot: 'off', video: 'off',
    serviceWorkers: 'block', locale: 'es-DO' },
  projects: [{ name: 'qa-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3117',
    url: `${baseURL}/login`, reuseExistingServer: false, timeout: 180000, env,
    stdout: 'ignore', stderr: 'ignore' },
});
