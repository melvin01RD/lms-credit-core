import { describe, it, expect } from "vitest";
import "./setup";
import { createPayment } from "@/lib/services/payment.service";
import { applyPayment } from "@/lib/domain/loan";
import { LoanStatus, PaymentType } from "@prisma/client";
import { financialFixture } from "./financial-fixture";

describe("Edge Cases - Payment Processing", () => {
  it("rejects decimal amounts with an unallocated remainder", async () => {
    financialFixture();
    await expect(createPayment({ loanId: "loan-1", totalAmount: 300.25,
      type: PaymentType.REGULAR, createdById: "user-1" })).rejects.toMatchObject({ code: "INVALID_PAYMENT_AMOUNT" });
  });
  it("derives payment type from covered installments, preserving fixed interest", async () => {
    financialFixture();
    const result = await createPayment({ loanId: "loan-1", totalAmount: 300,
      type: PaymentType.CAPITAL_PAYMENT, createdById: "user-1" });
    expect(result.payment.type).toBe(PaymentType.REGULAR);
    expect(Number(result.payment.interestApplied)).toBe(78);
  });
});

describe("Edge Cases - Domain Logic", () => {
  it("should handle very small payments", () => {
    const result = applyPayment(1000, 0.01);

    expect(result.balance).toBe(999.99);
    expect(result.status).toBe(LoanStatus.ACTIVE);
  });

  it("should handle large loan amounts", () => {
    const largeAmount = 1000000000;
    const payment = 1000000;

    const result = applyPayment(largeAmount, payment);

    expect(result.balance).toBe(999000000);
    expect(result.status).toBe(LoanStatus.ACTIVE);
  });

  it("should handle decimal precision in domain logic", () => {
    const result = applyPayment(100.5, 50.25);

    expect(result.balance).toBeCloseTo(50.25, 2);
    expect(result.status).toBe(LoanStatus.ACTIVE);
  });
});
