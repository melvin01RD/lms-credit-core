import { PrismaClient } from '@prisma/client';
import { refreshSession } from '../../lib/auth/session';
import { SESSION_COOKIE_NAME } from '../../lib/config/session';
const { validate, baseURL } = require('./environment.cjs');
export type QARole = 'ADMIN' | 'OPERATOR';
const users = { ADMIN: 'qa.admin@lms.local', OPERATOR: 'qa.operator@lms.local' } as const;
export function database() {
  if (typeof window !== 'undefined') throw new Error('QA sessions require Node.');
  validate(process.env);
  return new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } }, log: [] });
}
export async function sessionState(role: QARole, age: 'fresh' | 'expired' | 'inactive' = 'fresh') {
  const db = database();
  try {
    const user = await db.user.findUnique({ where: { email: users[role] },
      select: { id: true, email: true, firstName: true, lastName: true, active: true, role: true } });
    if (!user || !user.active || user.role !== role) throw new Error('Authorized QA user unavailable or role mismatch.');
    const realNow = Date.now;
    let token: string;
    try {
      const seconds = age === 'expired' ? 720 : age === 'inactive' ? 605 : 0;
      Date.now = () => realNow() - seconds * 1000;
      token = refreshSession({ userId: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role });
    } finally { Date.now = realNow; }
    return { cookies: [{ name: SESSION_COOKIE_NAME, value: token, domain: new URL(baseURL).hostname,
      path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' as const }], origins: [] };
  } catch { throw new Error('QA session preparation failed; details suppressed to protect credentials.'); }
  finally { await db.$disconnect(); }
}
