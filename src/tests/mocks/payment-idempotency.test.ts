import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, PaymentType } from "@prisma/client";
const state = vi.hoisted(() => ({ records: new Map<string, unknown>(), tx: { $executeRaw: vi.fn(), auditLog: { findUnique: vi.fn(), create: vi.fn() } } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn(state.tx) } }));
import { withPaymentIdempotency } from "@/lib/services/payment-idempotency";
import type { PaymentResult } from "@/lib/services/payment.service";

const data = { loanId: "loan-1", totalAmount: 1000, type: PaymentType.REGULAR, createdById: "user-1", paymentDate: new Date("2026-10-07") };
const result = { payment: { id: "payment-1" }, loan: { id: "loan-1" }, previousBalance: 2000, newBalance: 1000, statusChanged: false } as PaymentResult;
beforeEach(() => {
  vi.clearAllMocks(); state.records.clear();
  state.tx.auditLog.findUnique.mockImplementation(({ where }) => state.records.get(where.id) ?? null);
  state.tx.auditLog.create.mockImplementation(({ data }) => { state.records.set(data.id, data); return data; });
});
describe("Durable payment retries", () => {
  it("returns the committed result without creating another payment", async () => {
    const create = vi.fn().mockResolvedValue(result);
    await withPaymentIdempotency(data, "controlled-retry-key", create);
    expect(await withPaymentIdempotency(data, "controlled-retry-key", create)).toEqual(result);
    expect(create).toHaveBeenCalledTimes(1);
    expect(state.tx.$executeRaw).toHaveBeenCalledTimes(3);
  });
  it("rejects a reused key with changed financial data", async () => {
    const create = vi.fn().mockResolvedValue(result);
    await withPaymentIdempotency(data, "controlled-retry-key", create);
    await expect(withPaymentIdempotency({ ...data, totalAmount: 2000 }, "controlled-retry-key", create)).rejects.toMatchObject({ statusCode: 409 });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("separates keys by authenticated user", async () => {
    const create = vi.fn().mockResolvedValue(result);
    await withPaymentIdempotency(data, "controlled-retry-key", create);
    await withPaymentIdempotency({ ...data, createdById: "user-2" }, "controlled-retry-key", create);
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("does not store unsuccessful attempts", async () => {
    await expect(withPaymentIdempotency(data, "controlled-retry-key", vi.fn().mockRejectedValue(new Error("failure")))).rejects.toThrow("failure");
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects invalid keys before opening a transaction", async () => {
    await expect(withPaymentIdempotency(data, "bad", vi.fn())).rejects.toMatchObject({ statusCode: 400 });
    expect(state.tx.$executeRaw).not.toHaveBeenCalled();
  });
});
