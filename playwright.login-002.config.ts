import { defineConfig } from '@playwright/test';
import loginConfig from './playwright.login.config';

const production = process.env.LOGIN_QA_PRODUCTION === '1';
const output = production ? 'test-results/login-002/production' : 'test-results/login-002';

export default defineConfig({
  ...loginConfig,
  testMatch: 'bug-login-002.spec.ts',
  reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
  outputDir: `${output}/artifacts`,
  use: { ...loginConfig.use, colorScheme: 'dark', video: 'retain-on-failure' },
  webServer: production ? {
    command: 'npm run start -- --port 3101', url: 'http://localhost:3101/login',
    reuseExistingServer: false, timeout: 120000,
    env: {
      NEXT_DIST_DIR: '.next-login-build',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/login_test',
      JWT_SECRET: 'bug-login-001-local-test-secret-not-a-real-credential',
    },
  } : loginConfig.webServer,
});
