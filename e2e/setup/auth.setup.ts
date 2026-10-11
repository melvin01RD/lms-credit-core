import { mkdir, writeFile } from 'node:fs/promises';
import { sessionState } from '../qa/session';
import teardown from './auth.teardown';
export default async function setup() {
  await mkdir('playwright/.auth', { recursive: true });
  await teardown();
  try {
    for (const role of ['ADMIN', 'OPERATOR'] as const) {
      await writeFile(`playwright/.auth/${role.toLowerCase()}.json`, JSON.stringify(await sessionState(role)), { mode: 0o600 });
    }
  } catch (error) { await teardown(); throw error; }
}
