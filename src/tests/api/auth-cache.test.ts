import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
vi.mock('../../../lib/auth', () => ({ getSession: vi.fn(), refreshSession: vi.fn(() => 'test-token') }));
import { getSession } from '../../../lib/auth';
import { withAuth } from '../../../lib/api/auth-middleware';
import { withRole } from '../../../lib/api/role-middleware';

describe('authenticated response cache policy', () => {
  beforeEach(() => { vi.mocked(getSession).mockResolvedValue({ userId: 'test', email: 'test@example.test', firstName: 'Test', lastName: 'User', role: 'ADMIN', lastActivity: Math.floor(Date.now() / 1000) }); });
  it.each(['auth', 'role'])('prevents shared caching through %s middleware', async kind => {
    const handler = async () => NextResponse.json({ private: true }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
    const route = kind === 'auth' ? withAuth(handler) : withRole(['ADMIN'], handler);
    const response = await route(new Request('http://localhost/api/test'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(response.cookies.get('lms_session')?.value).toBe('test-token');
  });
});
