import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup";
import { cancelLoan, markLoanAsOverdue } from "../../../lib/services/loan.service";
import { LoanNotFoundError, PaymentNotAllowedError } from "../../../lib/errors";
import { LoanStatus } from "@prisma/client";
import { prismaMock } from "./prisma.mock";
import { createMockLoan } from "./test-factories";
import { financialFixture } from "./financial-fixture";

describe("cancelLoan", () => {
  beforeEach(() => {
    financialFixture();
  });

  it("should cancel an ACTIVE loan", async () => {
    const mockLoan = createMockLoan({ status: LoanStatus.ACTIVE });
    const canceledLoan = createMockLoan({ status: LoanStatus.CANCELED });

    prismaMock.loan.findUnique.mockResolvedValue(mockLoan);
    prismaMock.loan.update.mockResolvedValue(canceledLoan);

    const result = await cancelLoan("loan-1", "user-1");

    expect(result.status).toBe(LoanStatus.CANCELED);
  });

  it("should throw error when canceling PAID loan", async () => {
    const paidLoan = createMockLoan({ status: LoanStatus.PAID });
    prismaMock.loan.findUnique.mockResolvedValue(paidLoan);

    await expect(cancelLoan("loan-1", "user-1")).rejects.toThrow(PaymentNotAllowedError);
  });

  it("should throw error when loan already CANCELED", async () => {
    const canceledLoan = createMockLoan({ status: LoanStatus.CANCELED });
    prismaMock.loan.findUnique.mockResolvedValue(canceledLoan);

    await expect(cancelLoan("loan-1", "user-1")).rejects.toThrow(
      "El préstamo ya está cancelado"
    );
  });

  it("should throw LoanNotFoundError when not found", async () => {
    prismaMock.loan.findUnique.mockResolvedValue(null);

    await expect(cancelLoan("non-existent", "user-1")).rejects.toThrow(LoanNotFoundError);
  });
});

describe("markLoanAsOverdue", () => {
  beforeEach(() => {
    financialFixture();
  });

  it("should mark ACTIVE loan as OVERDUE", async () => {
    const activeLoan = createMockLoan({ status: LoanStatus.ACTIVE });
    const overdueLoan = createMockLoan({ status: LoanStatus.OVERDUE });

    prismaMock.loan.findUnique.mockResolvedValue(activeLoan);
    prismaMock.loan.update.mockResolvedValue(overdueLoan);

    const result = await markLoanAsOverdue("loan-1", "user-1");

    expect(result.status).toBe(LoanStatus.OVERDUE);
  });

  it("should throw error for non-ACTIVE loans", async () => {
    const paidLoan = createMockLoan({ status: LoanStatus.PAID });
    prismaMock.loan.findUnique.mockResolvedValue(paidLoan);

    await expect(markLoanAsOverdue("loan-1", "user-1")).rejects.toThrow(
      "Solo préstamos ACTIVE pueden marcarse como OVERDUE"
    );
  });
});
