import { describe, expect, it } from "vitest";
import { PaymentFrequency, Prisma } from "@prisma/client";
import { calculateFlatRateLoan } from "@/lib/domain/flatRateCalculator";
import { financialDay, isFinanciallyOverdue } from "@/lib/domain/financial-calendar";

describe("Exact Flat Rate schedules", () => {
  it.each([[100, 10, 3], [10000, 3500, 45], [1, 0, 3], [0.03, 0.01, 3], [123.45, 23.45, 19]])(
    "conserves principal, fixed interest and each installment (%s/%s/%s)", (principalAmount, totalFinanceCharge, termCount) => {
      const result = calculateFlatRateLoan({ principalAmount, totalFinanceCharge, termCount, paymentFrequency: PaymentFrequency.DAILY, startDate: new Date("2026-10-10T12:00:00Z") });
      const sum = (field: "expectedAmount" | "principalExpected" | "interestExpected") => result.schedule.reduce((a, e) => a.plus(e[field]), new Prisma.Decimal(0));
      expect(sum("expectedAmount").eq(new Prisma.Decimal(principalAmount).plus(totalFinanceCharge))).toBe(true);
      expect(sum("principalExpected").eq(principalAmount)).toBe(true);
      expect(sum("interestExpected").eq(totalFinanceCharge)).toBe(true);
      for (const e of result.schedule) {
        expect(new Prisma.Decimal(e.principalExpected).plus(e.interestExpected).eq(e.expectedAmount)).toBe(true);
        expect(e.principalExpected).toBeGreaterThanOrEqual(0); expect(e.interestExpected).toBeGreaterThanOrEqual(0);
      }
    });
  it("uses Santo Domingo calendar boundaries consistently", () => {
    expect(financialDay(new Date("2026-10-10T03:59:59Z"))).toBe("2026-10-09");
    expect(isFinanciallyOverdue(new Date("2026-10-09T12:00:00Z"), new Date("2026-10-10T04:00:00Z"))).toBe(true);
    expect(isFinanciallyOverdue(new Date("2026-10-10T12:00:00Z"), new Date("2026-10-10T04:00:00Z"))).toBe(false);
  });
});
