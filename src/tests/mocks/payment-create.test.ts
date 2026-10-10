import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup";
import { createPayment } from "../../../lib/services/payment.service";
import {
  LoanNotFoundError,
  PaymentNotAllowedError,
  InvalidPaymentAmountError,
} from "../../../lib/errors";
import { LoanStatus, PaymentType } from "@prisma/client";
import { prismaMock } from "./prisma.mock";
import { createMockFlatRateLoan, createMockSchedule } from "./test-factories";
import { financialFixture } from "./financial-fixture";

describe("createPayment - Validation Errors", () => {
  beforeEach(() => {
    financialFixture();
  });

  it("should throw LoanNotFoundError when loan does not exist", async () => {
    prismaMock.loan.findUnique.mockResolvedValue(null);

    await expect(
      createPayment({
        loanId: "non-existent",
        totalAmount: 1000,
        type: PaymentType.REGULAR,
        createdById: "user-1",
      })
    ).rejects.toThrow(LoanNotFoundError);
  });

  it("should throw PaymentNotAllowedError for PAID loans", async () => {
    const paidLoan = createMockFlatRateLoan({ status: LoanStatus.PAID, remainingCapital: 0 });
    prismaMock.loan.findUnique.mockResolvedValue(paidLoan);

    await expect(
      createPayment({
        loanId: "loan-flat-1",
        totalAmount: 300,
        type: PaymentType.REGULAR,
        createdById: "user-1",
      })
    ).rejects.toThrow(PaymentNotAllowedError);
  });

  it("should throw InvalidPaymentAmountError for zero amount", async () => {
    await expect(
      createPayment({
        loanId: "loan-flat-1",
        totalAmount: 0,
        type: PaymentType.REGULAR,
        createdById: "user-1",
      })
    ).rejects.toThrow(InvalidPaymentAmountError);
  });
});
