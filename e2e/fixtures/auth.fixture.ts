import { test as base, expect, Page } from '@playwright/test';
import { sessionState } from '../qa/session';
type Fixtures = { adminPage: Page; operatorPage: Page };
export const test = base.extend<Fixtures>({
  adminPage: async ({ browser }, use) => {
    // Reissue for every test: persisted setup states cannot silently expire in UI mode.
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3117', storageState: await sessionState('ADMIN') });
    try { await use(await context.newPage()); } finally { await context.close(); }
  },
  operatorPage: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3117', storageState: await sessionState('OPERATOR') });
    try { await use(await context.newPage()); } finally { await context.close(); }
  },
});
export { expect };
