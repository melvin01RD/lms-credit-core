import { defineConfig, devices } from '@playwright/test';

// Dedicated local development server; production is validated separately with build.
// HTTP development cookies work consistently in WebKit; production requires HTTPS.
// Business APIs use fixtures; real session checks use a test JWT and unreachable local DB.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['mobile-pwa.spec.ts', 'pwa-service-worker.spec.ts', 'bug-login-001.spec.ts'],
  timeout: 30000, expect: { timeout: 8000 }, workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/mobile/results.json' }]],
  outputDir: 'test-results/mobile/artifacts',
  use: { baseURL: 'http://localhost:3102', headless: true, locale: 'es-DO',
    serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...[360, 390, 430].map(width => ({ name: `android-${width}`,
      use: { ...devices['Pixel 5'], viewport: { width, height: 844 } } })),
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --port 3102',
    url: 'http://localhost:3102/login', reuseExistingServer: false, timeout: 120000,
    env: { NEXT_DIST_DIR: '.next-login-qa', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/mobile_test',
      JWT_SECRET: 'bug-login-001-local-test-secret-not-a-real-credential', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
