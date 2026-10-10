import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, PaymentType } from "@prisma/client";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { buildSync } from "esbuild";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { createPayment, reversePayment } from "@/lib/services/payment.service";
import { cancelLoan, activateLoan, approveViaToken, processOverdueLoans } from "@/lib/services/loan.service";
import { financialTransaction, lockLoan } from "@/lib/services/financial-transaction";

const enabled = Boolean(process.env.FINANCIAL_TEST_DATABASE_URL);
const workerFile = path.resolve("test-results/financial-worker.cjs");
const input = (idempotencyKey?: string, totalAmount = 300, loanId = "loan-1") => ({
  loanId, totalAmount, type: PaymentType.REGULAR, createdById: "user-1", idempotencyKey,
});
function worker(operation: string, data: object, onReady?: (start: () => void) => void): Promise<{ ok: boolean; code?: string; result?: any }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerFile, operation, JSON.stringify(data)], {
      env: { ...process.env, DATABASE_URL: process.env.FINANCIAL_TEST_DATABASE_URL }, windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let output = "", errors = "";
    child.stdout!.on("data", chunk => { output += chunk; });
    child.stderr!.on("data", chunk => { errors += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Financial worker timed out")); }, 25000);
    child.on("message", () => onReady ? onReady(() => child.send("go")) : child.send("go"));
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      // Prisma can log an expected constraint failure before our JSON result.
      const match = output.lastIndexOf('{"ok":');
      try { resolve(JSON.parse(output.slice(match))); } catch { reject(new Error(output + errors)); }
    });
  });
}
async function race(operations: { operation: string; data: object }[]) {
  const ready: (() => void)[] = [];
  return Promise.all(operations.map(({ operation, data }) => worker(operation, data, start => {
    ready.push(start);
    if (ready.length === operations.length) ready.forEach(go => go());
  })));
}
async function seed(loanId = "loan-1", count = 3, overdue = false) {
  return prisma.loan.create({ data: {
    id: loanId, clientId: "client-1", createdById: "user-1", principalAmount: 222 * count,
    totalFinanceCharge: 78 * count, totalPayableAmount: 300 * count, remainingCapital: 300 * count,
    installmentAmount: 300, termCount: count, paymentFrequency: "DAILY", status: "ACTIVE",
    paymentSchedule: { create: Array.from({ length: count }, (_, i) => ({ id: `${loanId}-s${i}`,
      installmentNumber: i + 1, dueDate: new Date(overdue ? "2020-01-01T12:00:00Z" : "2099-01-01T12:00:00Z"),
      expectedAmount: 300, principalExpected: 222, interestExpected: 78,
    })) },
  } });
}
async function consistent(loanId = "loan-1") {
  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, include: { paymentSchedule: true, payments: true } });
  const pending = loan.paymentSchedule.filter(e => ["PENDING", "OVERDUE"].includes(e.status));
  const balance = pending.reduce((a, e) => a.plus(e.expectedAmount), new Prisma.Decimal(0));
  expect(loan.remainingCapital.eq(balance)).toBe(true);
  expect(loan.installmentsPaid).toBe(loan.paymentSchedule.length - pending.length);
  for (const p of loan.payments) expect(p.totalAmount.eq(p.capitalApplied.plus(p.interestApplied).plus(p.lateFeeApplied))).toBe(true);
  return loan;
}

describe.skipIf(!enabled)("PostgreSQL financial consistency (separate processes)", () => {
  beforeAll(() => {
    const url = new URL(process.env.FINANCIAL_TEST_DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55440" || url.pathname !== "/lms_finance_test") throw new Error("Unsafe test database");
    buildSync({ entryPoints: ["scripts/financial-worker.ts"], bundle: true, platform: "node", format: "cjs", packages: "external", outfile: workerFile });
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "PaymentIdempotency", "PaymentSchedule", "Payment", "Loan", "AuditLog", "Client", "User" CASCADE');
    await prisma.user.createMany({ data: ["user-1", "user-2"].map(id => ({ id, email: `${id}@test.invalid`, password: "unused", firstName: "Test", lastName: "User" })) });
    await prisma.client.create({ data: { id: "client-1", firstName: "Test", documentId: "00000000001", phone: "8090000000" } });
  });
  afterAll(() => prisma.$disconnect());

  it("same key across six processes creates one payment and one durable response", async () => {
    await seed();
    const results = await race(Array.from({ length: 6 }, () => ({ operation: "payment", data: input("same-key-00000001") })));
    expect(results.every(r => r.ok)).toBe(true);
    expect(new Set(results.map(r => r.result.payment.id)).size).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentIdempotency.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "REGISTER_PAYMENT" } })).toBe(1);
    expect(Number((await consistent()).remainingCapital)).toBe(600);
  });
  it.each([true, false])("different operations serialize without lost updates (keys=%s)", async keys => {
    await seed();
    const results = await Promise.all(Array.from({ length: 3 }, (_, i) => worker("payment", input(keys ? `different-key-000${i}` : undefined))));
    expect(results.every(r => r.ok)).toBe(true);
    expect(await prisma.payment.count()).toBe(3);
    expect((await consistent()).status).toBe("PAID");
  });
  it("mixed keyed/unkeyed payments share the same loan lock", async () => {
    await seed();
    const results = await Promise.all([worker("payment", input("mixed-key-000001")), worker("payment", input())]);
    expect(results.every(r => r.ok)).toBe(true);
    expect(Number((await consistent()).remainingCapital)).toBe(300);
  });
  it("simultaneous reuse with different payload returns a conflict", async () => {
    await seed();
    const results = await Promise.all([worker("payment", input("conflict-key-001", 300)), worker("payment", input("conflict-key-001", 600))]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.find(r => !r.ok)?.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await prisma.payment.count()).toBe(1);
    await consistent();
  });
  it("key scope includes the actor and rejects a different loan", async () => {
    await seed(); await seed("loan-2");
    await createPayment(input("actor-scope-0001"));
    await expect(createPayment(input("actor-scope-0001", 300, "loan-2"))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await createPayment({ ...input("actor-scope-0001"), createdById: "user-2" });
    expect(await prisma.payment.count()).toBe(2);
  });
  it("a retry after a lost response returns the original typed snapshot", async () => {
    await seed();
    const first = await createPayment(input("lost-response-001"));
    await createPayment(input());
    const retry = await createPayment(input("lost-response-001"));
    expect(retry).toEqual(first);
    expect(retry.payment.totalAmount).toBeInstanceOf(Prisma.Decimal);
    expect(retry.payment.paymentDate).toBeInstanceOf(Date);
    expect(await prisma.payment.count()).toBe(2);
    await consistent();
  });
  it("duplicate reversal across processes restores principal/interest only once", async () => {
    await seed("loan-1", 3, true);
    const paid = await createPayment(input(undefined, 345));
    const results = await race(Array.from({ length: 3 }, () => ({ operation: "reverse", data: { paymentId: paid.payment.id, userId: "user-1" } })));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok).every(r => r.code === "PAYMENT_ALREADY_REVERSED")).toBe(true);
    expect(Number((await consistent()).remainingCapital)).toBe(900);
    expect(await prisma.payment.count()).toBe(2);
  });
  it("later payments prevent unsafe reversals while concurrent operations preserve balances", async () => {
    await seed();
    const a = await createPayment(input()), b = await createPayment(input());
    const results = await Promise.all([worker("reverse", { paymentId: a.payment.id, userId: "user-1" }),
      worker("reverse", { paymentId: b.payment.id, userId: "user-1" }), worker("payment", input())]);
    expect(results.filter(r => !r.ok).every(r => r.code === "CANNOT_REVERSE_PAYMENT")).toBe(true);
    const loan = await consistent();
    expect(Number(loan.remainingCapital)).toBeGreaterThanOrEqual(0);
    expect(await prisma.payment.count({ where: { reversesPaymentId: a.payment.id } })).toBeLessThanOrEqual(1);
  });
  it("cancellation and payment have a valid serial outcome", async () => {
    await seed();
    const results = await Promise.all([worker("payment", input()), worker("cancel", { loanId: "loan-1", userId: "user-1" })]);
    expect(results[1].ok).toBe(true);
    expect((await consistent()).status).toBe("CANCELED");
    await expect(createPayment(input())).rejects.toMatchObject({ code: "PAYMENT_NOT_ALLOWED" });
  });
  it("two cancellations write only one audit record", async () => {
    await seed();
    const results = await Promise.all([worker("cancel", { loanId: "loan-1", userId: "user-1" }), worker("cancel", { loanId: "loan-1", userId: "user-1" })]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "CANCEL_LOAN" } })).toBe(1);
  });
  it("cancellation and reversal never reactivate a canceled loan", async () => {
    await seed(); const paid = await createPayment(input());
    await Promise.all([worker("reverse", { paymentId: paid.payment.id, userId: "user-1" }), worker("cancel", { loanId: "loan-1", userId: "user-1" })]);
    expect((await consistent()).status).toBe("CANCELED");
  });
  it("rejects overpayment and unallocated remainders without writing anything", async () => {
    await seed();
    await expect(createPayment(input("overpayment-0001", 901))).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE" });
    await expect(createPayment(input("remainder-000001", 301))).rejects.toMatchObject({ code: "INVALID_PAYMENT_AMOUNT" });
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentIdempotency.count()).toBe(0);
    await consistent();
  });
  it("settles the exact rounded final installment including interest", async () => {
    await seed("loan-1", 3);
    await prisma.loan.update({ where: { id: "loan-1" }, data: { totalPayableAmount: 899.99, remainingCapital: 899.99, totalFinanceCharge: 233.99 } });
    await prisma.paymentSchedule.update({ where: { id: "loan-1-s2" }, data: { expectedAmount: 299.99, interestExpected: 77.99 } });
    await createPayment(input(undefined, 600));
    await expect(createPayment(input(undefined, 300))).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE" });
    await createPayment(input(undefined, 299.99));
    expect((await consistent()).status).toBe("PAID");
  });
  it.each(["AuditLog", "PaymentIdempotency", "PaymentSchedule", "Loan", "PaymentLateFeeAllocation"])("failure writing %s rolls back all writes and allows a retry", async table => {
    await seed("loan-1", 3, table === "PaymentLateFeeAllocation");
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION financial_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected test failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER financial_test_fail BEFORE ${["AuditLog", "PaymentLateFeeAllocation"].includes(table) ? "INSERT" : "UPDATE"} ON "${table}" FOR EACH ROW EXECUTE FUNCTION financial_test_fail()`);
    try {
      await expect(createPayment(input("rollback-test-001", table === "PaymentLateFeeAllocation" ? 345 : 300))).rejects.toThrow();
      expect(await prisma.payment.count()).toBe(0);
      expect(await prisma.auditLog.count()).toBe(0);
      expect(await prisma.paymentIdempotency.count()).toBe(0);
      expect(Number((await consistent()).remainingCapital)).toBe(900);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER financial_test_fail ON "${table}"`);
      await prisma.$executeRawUnsafe('DROP FUNCTION financial_test_fail()');
    }
    await createPayment(input("rollback-test-001", table === "PaymentLateFeeAllocation" ? 345 : 300));
    expect(await prisma.payment.count()).toBe(1);
  });
  it("a unique database constraint prevents a second reversal record", async () => {
    await seed(); const paid = await createPayment(input());
    const reversal = await reversePayment(paid.payment.id, "user-1", "test");
    const { id, createdAt, ...copy } = reversal.payment;
    await expect(prisma.payment.create({ data: copy })).rejects.toMatchObject({ code: "P2002" });
  });
  it("a disconnected database connection rolls back the payment before retry", async () => {
    await seed();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION financial_test_disconnect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_terminate_backend(pg_backend_pid()); RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER financial_test_disconnect BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION financial_test_disconnect()');
    try {
      await expect(createPayment(input("disconnect-key-01"))).rejects.toThrow();
      expect(await prisma.payment.count()).toBe(0);
      expect(await prisma.paymentIdempotency.count()).toBe(0);
      expect(Number((await consistent()).remainingCapital)).toBe(900);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER financial_test_disconnect ON "AuditLog"');
      await prisma.$executeRawUnsafe('DROP FUNCTION financial_test_disconnect()');
    }
    await createPayment(input("disconnect-key-01"));
    expect(await prisma.payment.count()).toBe(1);
  });
  it.each(["reverse", "cancel"])("audit failure rolls back %s atomically", async operation => {
    await seed(); const paid = await createPayment(input());
    await prisma.$executeRawUnsafe(`CREATE FUNCTION financial_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER financial_test_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION financial_test_fail()');
    try {
      await expect(operation === "reverse" ? reversePayment(paid.payment.id, "user-1", "test") : cancelLoan("loan-1", "user-1")).rejects.toThrow();
      expect(await prisma.payment.count()).toBe(1);
      const loan = await consistent(); expect(Number(loan.remainingCapital)).toBe(600); expect(loan.status).toBe("ACTIVE");
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER financial_test_fail ON "AuditLog"');
      await prisma.$executeRawUnsafe('DROP FUNCTION financial_test_fail()');
    }
  });
  it("activation and cancellation cannot revive a canceled draft", async () => {
    await seed(); await prisma.paymentSchedule.deleteMany();
    await prisma.loan.update({ where: { id: "loan-1" }, data: { status: "DRAFT" } });
    await Promise.allSettled([activateLoan("loan-1", "user-1"), cancelLoan("loan-1", "user-1")]);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: "loan-1" } })).status).toBe("CANCELED");
  });
  it("two approvals cannot generate duplicate installments", async () => {
    await seed(); await prisma.paymentSchedule.deleteMany();
    await prisma.loan.update({ where: { id: "loan-1" }, data: { status: "DRAFT", approvalToken: "test-token", approvalTokenExp: new Date("2099-01-01") } });
    const results = await Promise.allSettled([approveViaToken("test-token", "Test Client"), approveViaToken("test-token", "Test Client")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.paymentSchedule.count()).toBe(3);
    await consistent();
  });
  it("the overdue job cannot overwrite a concurrent settlement", async () => {
    await seed("loan-1", 3, true);
    await Promise.all([createPayment(input(undefined, 945)), processOverdueLoans("user-1")]);
    expect((await consistent()).status).toBe("PAID");
  });

  it.each(["none", "different", "mixed"])("FI-002: two DOP 1000 requests can settle the last installment only once (%s)", async keys => {
    await seed("loan-1", 1);
    await prisma.loan.update({ where: { id: "loan-1" }, data: { principalAmount: 800, totalFinanceCharge: 200,
      totalPayableAmount: 1000, remainingCapital: 1000, installmentAmount: 1000 } });
    await prisma.paymentSchedule.update({ where: { id: "loan-1-s0" }, data: { expectedAmount: 1000, principalExpected: 800, interestExpected: 200 } });
    const results = await race([0, 1].map(i => ({ operation: "payment", data: input(
      keys === "none" || (keys === "mixed" && i === 0) ? undefined : `last-installment-${i}`, 1000) })));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.find(r => !r.ok)?.code).toBe("PAYMENT_NOT_ALLOWED");
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(1);
    expect((await consistent()).status).toBe("PAID");
    await expect(createPayment(input(undefined, 1000))).rejects.toMatchObject({ code: "PAYMENT_NOT_ALLOWED" });
  });

  it("charges all mora first, preserves its allocation through LIFO reversals and never charges it twice", async () => {
    await seed("loan-1", 3, true);
    const first = await createPayment(input(undefined, 345));
    expect(Number(first.payment.lateFeeApplied)).toBe(45);
    expect(await prisma.paymentLateFeeAllocation.count()).toBe(3);
    const second = await createPayment(input());
    expect(Number(second.payment.lateFeeApplied)).toBe(0);
    await expect(reversePayment(first.payment.id, "user-1", "not latest")).rejects.toMatchObject({ code: "CANNOT_REVERSE_PAYMENT" });
    await reversePayment(second.payment.id, "user-1", "latest first");
    await reversePayment(first.payment.id, "user-1", "restore all fees");
    expect(await prisma.paymentLateFeeAllocation.count()).toBe(6);
    expect(Number((await consistent()).remainingCapital)).toBe(900);
    const paid = await createPayment(input(undefined, 945));
    expect(Number(paid.payment.lateFeeApplied)).toBe(45);
    expect((await consistent()).status).toBe("PAID");
  });

  it.each(["DRAFT", "PAID", "CANCELED"] as const)("rejects %s without financial writes", async status => {
    await seed(); await prisma.loan.update({ where: { id: "loan-1" }, data: { status } });
    await expect(createPayment(input("invalid-state-001"))).rejects.toMatchObject({ code: "PAYMENT_NOT_ALLOWED" });
    expect(await prisma.payment.count()).toBe(0); expect(await prisma.paymentIdempotency.count()).toBe(0);
  });

  it("paymentDate is receipt metadata and cannot remove current mora by backdating", async () => {
    await seed("loan-1", 3, true);
    const paymentDate = new Date("2019-01-01T12:00:00Z");
    await expect(createPayment({ ...input(), paymentDate })).rejects.toMatchObject({ code: "INVALID_PAYMENT_AMOUNT" });
    const paid = await createPayment({ ...input(undefined, 345), paymentDate });
    expect(paid.payment.paymentDate).toEqual(paymentDate);
    expect(Number(paid.payment.lateFeeApplied)).toBe(45);
  });

  it("legacy audit idempotency records replay after upgrade without another payment", async () => {
    await seed();
    const data = input("legacy-retry-0001");
    const first = await createPayment(input());
    const id = createHash("sha256").update(`${data.createdById}:${data.idempotencyKey}`).digest("hex");
    const fingerprint = createHash("sha256").update(JSON.stringify({ loanId: data.loanId, amount: 300, type: data.type, date: null })).digest("hex");
    await prisma.auditLog.create({ data: { id, userId: "user-1", action: "PAYMENT_IDEMPOTENCY", entity: "PAYMENT", entityId: first.payment.id,
      details: { fingerprint, result: JSON.parse(JSON.stringify(first)) } } });
    expect(await createPayment(data)).toEqual(first);
    await expect(createPayment({ ...data, totalAmount: 600 })).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.payment.count()).toBe(1);
  });

  it("requires reconciliation of historical mora without inventing installment allocations", async () => {
    await seed("loan-1", 3, true);
    const legacy = await prisma.payment.create({ data: { loanId: "loan-1", createdById: "user-1", type: "REGULAR",
      totalAmount: 315, capitalApplied: 222, interestApplied: 78, lateFeeApplied: 15 } });
    await prisma.paymentSchedule.update({ where: { id: "loan-1-s0" }, data: { status: "PAID", paymentId: legacy.id, paidAt: new Date() } });
    await prisma.loan.update({ where: { id: "loan-1" }, data: { remainingCapital: 600, installmentsPaid: 1 } });
    await expect(createPayment(input(undefined, 945))).rejects.toMatchObject({ code: "FINANCIAL_HISTORY_REVIEW_REQUIRED" });
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentLateFeeAllocation.count()).toBe(0);
  });

  it("rejects a historical schedule that claims a paid installment without matching ledger money", async () => {
    await seed();
    const legacy = await prisma.payment.create({ data: { loanId: "loan-1", createdById: "user-1", type: "REGULAR",
      totalAmount: 301, capitalApplied: 223, interestApplied: 78 } });
    await prisma.paymentSchedule.update({ where: { id: "loan-1-s0" }, data: { status: "PAID", paymentId: legacy.id, paidAt: new Date() } });
    await prisma.loan.update({ where: { id: "loan-1" }, data: { remainingCapital: 600, installmentsPaid: 1 } });
    await expect(createPayment(input())).rejects.toMatchObject({ code: "INVALID_PAYMENT_SCHEDULE" });
    expect(await prisma.payment.count()).toBe(1);
  });

  it("immutable payment and fee history rejects updates and deletion", async () => {
    await seed("loan-1", 3, true); const first = await createPayment(input(undefined, 345));
    await expect(prisma.payment.update({ where: { id: first.payment.id }, data: { paymentDate: new Date() } })).rejects.toThrow();
    await expect(prisma.payment.delete({ where: { id: first.payment.id } })).rejects.toThrow();
    await expect(prisma.paymentLateFeeAllocation.deleteMany()).rejects.toThrow();
    expect(await prisma.payment.count()).toBe(1); expect(await prisma.paymentLateFeeAllocation.count()).toBe(3);
    await consistent();
  });

  it("PostgreSQL deadlock aborts and retries the whole transaction without duplicate audits", async () => {
    await seed(); await seed("loan-2");
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const attempts = [0, 0];
    const operation = (index: number, first: string, second: string) => financialTransaction(async tx => {
      attempts[index]++;
      await lockLoan(tx, first);
      await tx.auditLog.create({ data: { userId: "user-1", action: "DEADLOCK_TEST", entity: "LOAN", entityId: first } });
      if (attempts[index] === 1) {
        if (++arrived === 2) release();
        await barrier;
      }
      await lockLoan(tx, second);
    });
    await Promise.all([operation(0, "loan-1", "loan-2"), operation(1, "loan-2", "loan-1")]);
    expect(attempts[0] + attempts[1]).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "DEADLOCK_TEST" } })).toBe(2);
    await consistent(); await consistent("loan-2");
  });
});
