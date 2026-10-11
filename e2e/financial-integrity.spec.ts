import { randomUUID, randomInt } from 'node:crypto';
import { mkdir, appendFile } from 'node:fs/promises';
import { test as auth, expect } from './fixtures/auth.fixture';
import { database, sessionState } from './qa/session';
import { request as apiRequest } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
const test = auth.extend<{ finance: { db: PrismaClient; clientId: string; loanId: string; document: string; actorId: string } }>({
  finance: async ({ adminPage }, use) => {
    const db = database(); // Validated before any HTTP write.
    const document = String(randomInt(10000000000, 99999999999));
    let clientId: string | undefined;
    try {
      const actor = await db.user.findUniqueOrThrow({ where: { email: 'qa.admin@lms.local' } });
      const client = await adminPage.request.post('/api/clients', { data: {
        firstName: 'QA E2E', lastName: randomUUID().slice(0, 12), documentId: document, phone: '8090000000',
      } });
      expect(client.status()).toBe(201);
      clientId = (await client.json()).id;
      await mkdir('test-results/qa-owned', { recursive: true });
      await appendFile('test-results/qa-owned/records.jsonl', JSON.stringify({ clientId, document, phase: 'created' }) + '\n');
      const loan = await adminPage.request.post('/api/loans', { data: { clientId, createdById: actor.id,
        principalAmount: 600, totalFinanceCharge: 0, termCount: 2, paymentFrequency: 'MONTHLY' } });
      expect(loan.status()).toBe(201);
      const loanId = (await loan.json()).id;
      await appendFile('test-results/qa-owned/records.jsonl', JSON.stringify({ clientId, loanIds: [loanId], phase: 'prepared' }) + '\n');
      await use({ db, clientId: clientId!, loanId, document, actorId: actor.id });
    } finally {
      try {
        if (clientId) {
          // Payment history is immutable in PR #2: compensate, never disable triggers/delete history.
          const loans = await db.loan.findMany({ where: { clientId }, select: { id: true, status: true } });
          await mkdir('test-results/qa-owned', { recursive: true });
          await appendFile('test-results/qa-owned/records.jsonl', JSON.stringify({ clientId, loanIds: loans.map(l => l.id) }) + '\n');
          const actor = await db.user.findUniqueOrThrow({ where: { email: 'qa.admin@lms.local' } });
          // Independent request context survives a timed-out/closed browser page.
          const cleanup = await apiRequest.newContext({ baseURL: 'http://127.0.0.1:3117', storageState: await sessionState('ADMIN') });
          try {
          for (const loan of loans) {
            const payments = await db.payment.findMany({ where: { loanId: loan.id, reversesPaymentId: null, reversedBy: null }, orderBy: { createdAt: 'desc' } });
            for (const payment of payments) {
              const reversal = await cleanup.post(`/api/payments/${payment.id}/reverse`, {
                data: { reversedById: actor.id, reason: 'QA fixture teardown compensation' } });
              expect(reversal.status()).toBe(200);
            }
            if (loan.status !== 'CANCELED') {
              const canceled = await cleanup.post(`/api/loans/${loan.id}/cancel`, { data: { userId: actor.id } });
              expect(canceled.status()).toBe(200);
            }
          }
          await db.client.update({ where: { id: clientId, documentId: document }, data: { active: false } });
          await appendFile('test-results/qa-owned/records.jsonl', JSON.stringify({ clientId, phase: 'compensated' }) + '\n');
          } finally { await cleanup.dispose(); }
        }
      } catch { throw new Error('QA cleanup failed; investigate owned synthetic records without logging connection details.'); }
      finally { await db.$disconnect(); }
    }
  },
});
test('FI-E2E-001 UI payment updates balance; FI-E2E-008 audit', async ({ adminPage, finance: f }) => {
  await adminPage.goto('/dashboard/pagos');
  await adminPage.getByRole('button', { name: 'Registrar Pago', exact: true }).click();
  const modal = adminPage.getByRole('dialog', { name: 'Registrar Pago' });
  await modal.locator('#loanSearch').fill(f.document);
  await modal.locator('.search-result-item').filter({ hasText: f.document }).click();
  await modal.locator('#totalAmount').fill('300');
  const response = adminPage.waitForResponse(r => r.url().endsWith('/api/payments') && r.request().method() === 'POST');
  adminPage.once('dialog', dialog => dialog.accept());
  await modal.getByRole('button', { name: 'Registrar Pago', exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(modal).toBeHidden();
  const loan = await f.db.loan.findUniqueOrThrow({ where: { id: f.loanId } });
  expect(Number(loan.remainingCapital)).toBe(300);
  expect(loan.installmentsPaid).toBe(1);
  const payment = await f.db.payment.findFirstOrThrow({ where: { loanId: f.loanId } });
  expect(payment.createdById).toBe(f.actorId);
  expect(await f.db.auditLog.count({ where: { entityId: payment.id, action: 'REGISTER_PAYMENT', userId: f.actorId } })).toBe(1);
});
test('FI-E2E-002 overpayment leaves balances untouched', async ({ adminPage, finance: f }) => {
  const response = await adminPage.request.post('/api/payments', { data: { loanId: f.loanId, totalAmount: 601 } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
  expect(Number((await f.db.loan.findUniqueOrThrow({ where: { id: f.loanId } })).remainingCapital)).toBe(600);
  expect(await f.db.payment.count({ where: { loanId: f.loanId } })).toBe(0);
});
test('FI-E2E-003 durable HTTP idempotency; FI-E2E-006 compensation', async ({ adminPage, finance: f }) => {
  const options = { headers: { 'Idempotency-Key': randomUUID() }, data: { loanId: f.loanId, totalAmount: 300 } };
  const first = await adminPage.request.post('/api/payments', options);
  const second = await adminPage.request.post('/api/payments', options);
  expect(first.status()).toBe(201); expect(second.status()).toBe(201);
  const a = await first.json(); const b = await second.json();
  expect(b).toEqual(a);
  expect(await f.db.payment.count({ where: { loanId: f.loanId } })).toBe(1);
  const reversed = await adminPage.request.post(`/api/payments/${a.payment.id}/reverse`, {
    data: { reversedById: f.actorId, reason: 'Synthetic QA compensation' } });
  expect(reversed.status()).toBe(200);
  expect(Number((await f.db.loan.findUniqueOrThrow({ where: { id: f.loanId } })).remainingCapital)).toBe(600);
  const payments = await f.db.payment.findMany({ where: { loanId: f.loanId } });
  expect(payments.length).toBe(2);
  expect(payments.reduce((sum, p) => sum + Number(p.totalAmount), 0)).toBe(0);
  expect(await f.db.auditLog.count({ where: { action: 'REVERSE_PAYMENT', entityId: { in: payments.map(p => p.id) } } })).toBe(1);
});
test('FI-E2E-007 paid loan rejects additional payment', async ({ adminPage, finance: f }) => {
  const paid = await adminPage.request.post('/api/payments', { data: { loanId: f.loanId, totalAmount: 600, type: 'FULL_SETTLEMENT' } });
  expect(paid.status()).toBe(201);
  const rejected = await adminPage.request.post('/api/payments', { data: { loanId: f.loanId, totalAmount: 300 } });
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error.code).toBe('PAYMENT_NOT_ALLOWED');
  expect(await f.db.payment.count({ where: { loanId: f.loanId } })).toBe(1);
});
