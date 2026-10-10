import { defineConfig, devices } from '@playwright/test';

// Dedicated local server; no production credentials or database are used.
export default defineConfig({
  testDir: './e2e', testMatch: 'bug-login-001.spec.ts',
  timeout: 30000, expect: { timeout: 8000 }, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/login/results.json' }]],
  outputDir: 'test-results/login/artifacts',
  use: { baseURL: 'http://localhost:3101', headless: true, serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 3101', url: 'http://localhost:3101/login',
    reuseExistingServer: false, timeout: 120000,
    env: { NEXT_DIST_DIR: '.next-login-qa', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/login_test', JWT_SECRET: 'bug-login-001-local-test-secret-not-a-real-credential' },
  },
});
