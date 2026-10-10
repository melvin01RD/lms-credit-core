import { beforeEach, describe, expect, it } from "vitest";
import "./setup";
import { Prisma, PaymentType } from "@prisma/client";
import { createPayment, reversePayment } from "@/lib/services/payment.service";
import { prismaMock } from "./prisma.mock";
import { financialFixture } from "./financial-fixture";
const data = (totalAmount = 300) => ({ loanId: "loan-1", totalAmount, createdById: "user-1", type: PaymentType.REGULAR });
describe("Flat Rate transactional payments", () => {
  beforeEach(() => { financialFixture(); });
  it("links exactly one paid installment to its payment", async () => {
    const s = financialFixture(); const r = await createPayment(data());
    expect(s.entries.filter(e => e.status === "PAID")).toHaveLength(1);
    expect(s.entries[0].paymentId).toBe(r.payment.id);
    expect(r.installmentsCovered).toBe(1); expect(r.installmentsPaid).toBe(1); expect(r.newBalance).toBe(600);
  });
  it("uses actual principal/interest amounts from the schedule", async () => {
    const r = await createPayment(data());
    expect(Number(r.payment.capitalApplied)).toBe(222); expect(Number(r.payment.interestApplied)).toBe(78);
  });
  it("records actor, supplied date and next pending due date", async () => {
    const s = financialFixture(); const date = new Date("2026-01-01");
    const r = await createPayment({ ...data(), paymentDate: date });
    expect(r.payment.createdById).toBe("user-1"); expect(r.payment.paymentDate).toEqual(date);
    expect(r.loan.nextDueDate).toEqual(s.entries[1].dueDate);
  });
  it("advances multiple complete installments", async () => {
    const r = await createPayment(data(600)); expect(r.payment.type).toBe("ADVANCE");
    expect(r.installmentsPaid).toBe(2); expect(r.newBalance).toBe(300); expect(r.excessAmount).toBe(0);
  });
  it("settles a loan with zero balance and no due date", async () => {
    const r = await createPayment(data(900)); expect(r.payment.type).toBe("FULL_SETTLEMENT");
    expect(r.loan.status).toBe("PAID"); expect(r.newBalance).toBe(0); expect(r.loan.nextDueDate).toBeNull();
    expect(r.installmentsPaid).toBe(3); expect(r.installmentsPending).toBe(0);
  });
  it("charges all pending mora first, once per installment", async () => {
    financialFixture(3, true); const r = await createPayment(data(345));
    expect(Number(r.payment.lateFeeApplied)).toBe(45); expect(r.newBalance).toBe(600);
    expect(r.loan.status).toBe("OVERDUE"); expect(Number((await createPayment(data(300))).payment.lateFeeApplied)).toBe(0);
  });
  it("settles all overdue installments including mora", async () => {
    financialFixture(3, true); const r = await createPayment(data(945));
    expect(Number(r.payment.lateFeeApplied)).toBe(45); expect(r.newBalance).toBe(0);
  });
  it("does not use backdating to bypass current mora", async () => {
    financialFixture(3, true);
    await expect(createPayment({ ...data(), paymentDate: new Date("2019-01-01") })).rejects.toMatchObject({ code: "INVALID_PAYMENT_AMOUNT" });
  });
  it.each([0, -1, NaN, Infinity, 0.001, 10000000000])("rejects invalid money %s", async amount => {
    await expect(createPayment(data(amount))).rejects.toMatchObject({ code: "INVALID_PAYMENT_AMOUNT" });
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });
  it.each(["CANCELED", "PAID", "DRAFT"])("rejects payments on %s loans", async status => {
    financialFixture().loan.status = status;
    await expect(createPayment(data())).rejects.toMatchObject({ code: "PAYMENT_NOT_ALLOWED" });
  });
  it("rejects nonexistent loans", async () => {
    prismaMock.loan.findUnique.mockResolvedValue(null);
    await expect(createPayment(data())).rejects.toMatchObject({ code: "LOAN_NOT_FOUND" });
  });
  it.each([1, 301, 350])("rejects incomplete installments or unallocated remainders %s", async amount => {
    await expect(createPayment(data(amount))).rejects.toMatchObject({ code: "INVALID_PAYMENT_AMOUNT" });
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });
  it("rejects overpayments", async () => {
    await expect(createPayment(data(900.01))).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE" });
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });
  it("uses the exact final installment rounding adjustment", async () => {
    const s = financialFixture(); s.entries[2].expectedAmount = 299.99; s.entries[2].interestExpected = 77.99;
    s.loan.totalFinanceCharge = 233.99; s.loan.totalPayableAmount = 899.99; s.loan.remainingCapital = 899.99;
    await createPayment(data(600)); const r = await createPayment(data(299.99));
    expect(r.newBalance).toBe(0); expect(Number(r.payment.interestApplied)).toBe(77.99);
  });
  it("rejects an inconsistent schedule breakdown", async () => {
    financialFixture().entries[0].interestExpected = 99;
    await expect(createPayment(data())).rejects.toMatchObject({ code: "INVALID_PAYMENT_SCHEDULE" });
  });
  it("requires all selected schedule rows to be updated", async () => {
    prismaMock.paymentSchedule.updateMany.mockResolvedValue({ count: 0 });
    await expect(createPayment(data())).rejects.toMatchObject({ code: "PAYMENT_CONFLICT" });
  });
  it("propagates audit failures to the transaction", async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("audit unavailable"));
    await expect(createPayment(data())).rejects.toThrow("audit unavailable");
  });
  it("writes audit through the transaction", async () => {
    const r = await createPayment(data());
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityId: r.payment.id, action: "REGISTER_PAYMENT", userId: "user-1" }) }));
  });
  it("refunds mora on reversal without adding it to the loan balance", async () => {
    financialFixture(3, true); const p = await createPayment(data(345));
    const r = await reversePayment(p.payment.id, "user-1", "Error");
    expect(r.newBalance).toBe(900); expect(Number(r.payment.totalAmount)).toBe(-345);
    expect(Number(r.payment.lateFeeApplied)).toBe(-45); expect(r.payment.reversesPaymentId).toBe(p.payment.id);
  });
  it("preserves Decimal values in service results", async () => {
    expect((await createPayment(data())).payment.totalAmount).toBeInstanceOf(Prisma.Decimal);
  });
});
