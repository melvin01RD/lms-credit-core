import { rm } from 'node:fs/promises';
export default async function teardown() {
  for (const role of ['admin', 'operator']) await rm(`playwright/.auth/${role}.json`, { force: true });
}
