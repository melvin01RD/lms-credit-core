import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup";
import {
  calculateFlatRateDistribution,
  createPayment,
} from "../../../lib/services/payment.service";
import {
  InvalidPaymentAmountError,
} from "../../../lib/errors";
import { LoanStatus, PaymentFrequency, PaymentType, ScheduleStatus } from "@prisma/client";
import { prismaMock } from "./prisma.mock";
import { createMockPayment, createMockFlatRateLoan, createMockSchedule } from "./test-factories";
import { financialFixture } from "./financial-fixture";

// ============================================
// calculateFlatRateDistribution — no pending entries
// ============================================

describe("calculateFlatRateDistribution - sin cuotas pendientes", () => {
  beforeEach(() => {
    financialFixture();
  });

  it("lanza error si no hay cuotas pendientes", async () => {
    prismaMock.loan.findUnique.mockResolvedValue(createMockFlatRateLoan());
    prismaMock.paymentSchedule.findMany.mockResolvedValue([]);

    await expect(calculateFlatRateDistribution("loan-flat-1", 300))
      .rejects.toThrow("no tiene cuotas pendientes");
  });
});

// ============================================
// createFlatRatePayment — monto insuficiente con mora
// ============================================

describe("createFlatRatePayment - monto insuficiente con mora", () => {
  beforeEach(() => {
    financialFixture();
  });

  it("lanza InvalidPaymentAmountError cuando pago cubre solo la mora pero no una cuota completa", async () => {
    financialFixture(2, true);

    await expect(
      createPayment({
        loanId: "loan-1",
        totalAmount: 15,
        type: PaymentType.REGULAR,
        createdById: "user-1",
      })
    ).rejects.toThrow(InvalidPaymentAmountError);
  });
});
