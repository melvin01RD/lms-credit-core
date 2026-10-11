import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, PaymentType } from "@prisma/client";
import { withPaymentIdempotency } from "@/lib/services/payment-idempotency";
import type { PaymentResult } from "@/lib/services/payment.service";

const data = { loanId: "loan-1", totalAmount: 300, type: PaymentType.REGULAR, createdById: "user-1", idempotencyKey: "test-retry-key-001" };
const result = { payment: { id: "p1", totalAmount: new Prisma.Decimal(300), paymentDate: new Date("2026-10-09") },
  loan: { id: "loan-1", remainingCapital: new Prisma.Decimal(600) }, previousBalance: 900, newBalance: 600, statusChanged: false } as PaymentResult;
let record: any;
const txMock = { $executeRaw: vi.fn(), auditLog: { findUnique: vi.fn() }, paymentIdempotency: { findUniqueOrThrow: vi.fn(), update: vi.fn() } };
const tx = txMock as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.clearAllMocks(); record = null;
  txMock.$executeRaw.mockImplementation(async (_sql, _user, _operation, _key, fingerprint) => { if (fingerprint) record ??= { fingerprint, result: null }; return 1; });
  txMock.paymentIdempotency.findUniqueOrThrow.mockImplementation(async () => record);
  txMock.paymentIdempotency.update.mockImplementation(async ({ data }) => { record.result = data.result; return record; });
});
describe("Payment idempotency codec and input checks (unit only)", () => {
  it("replays the same typed result without invoking financial writes again", async () => {
    const create = vi.fn().mockResolvedValue(result);
    await withPaymentIdempotency(tx, data, create);
    expect(await withPaymentIdempotency(tx, data, create)).toEqual(result);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it.each(["", "short", "space in a long key", "x".repeat(129)])("rejects malformed keys %s", async idempotencyKey => {
    await expect(withPaymentIdempotency(tx, { ...data, idempotencyKey }, vi.fn())).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(txMock.$executeRaw).not.toHaveBeenCalled();
  });
  it.each([{ totalAmount: 600 }, { loanId: "other" }, { type: PaymentType.ADVANCE }, { paymentDate: new Date("2026-10-08") }])("rejects changed content %j", async changed => {
    const create = vi.fn().mockResolvedValue(result);
    await withPaymentIdempotency(tx, data, create);
    await expect(withPaymentIdempotency(tx, { ...data, ...changed }, create)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("does not persist a response when financial writes throw", async () => {
    await expect(withPaymentIdempotency(tx, data, vi.fn().mockRejectedValue(new Error("failed")))).rejects.toThrow("failed");
    expect(txMock.paymentIdempotency.update).not.toHaveBeenCalled();
  });
});
