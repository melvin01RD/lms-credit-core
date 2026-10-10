import { vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaMock } from "./prisma.mock";
import { createMockFlatRateLoan, createMockSchedule } from "./test-factories";

/** Unit-only state model. Real locking and rollback are tested against PostgreSQL. */
export function financialFixture(count = 3, overdue = false) {
  vi.resetAllMocks();
  const loan: any = createMockFlatRateLoan({ id: "loan-1", termCount: count,
    principalAmount: 222 * count, totalFinanceCharge: 78 * count,
    totalPayableAmount: 300 * count, remainingCapital: 300 * count });
  const entries: any[] = createMockSchedule("loan-1", count, 300,
    new Date(overdue ? "2020-01-01" : "2099-01-01"));
  const payments: any[] = [];
  const fees: any[] = [];
  prismaMock.$queryRaw.mockResolvedValue([{ id: loan.id }]);
  prismaMock.$transaction.mockImplementation(async cb => cb(prismaMock));
  prismaMock.loan.findUnique.mockImplementation(async () => ({ ...loan }));
  prismaMock.loan.update.mockImplementation(async ({ data }) => Object.assign(loan, data));
  prismaMock.paymentSchedule.findMany.mockImplementation(async ({ where }) => entries.filter(e =>
    (!where.status || where.status.in.includes(e.status)) && (!where.paymentId || e.paymentId === where.paymentId)));
  prismaMock.paymentSchedule.updateMany.mockImplementation(async ({ where, data }) => {
    const matched = entries.filter(e => (!where.id || where.id.in.includes(e.id)) &&
      (!where.paymentId || e.paymentId === where.paymentId) && (!where.status || where.status.in.includes(e.status)));
    matched.forEach(e => Object.assign(e, data));
    return { count: matched.length };
  });
  prismaMock.paymentSchedule.findFirst.mockImplementation(async ({ where }) => entries.find(e =>
    (!where.installmentNumber || e.installmentNumber > where.installmentNumber.gt) &&
    (!where.status || where.status.in.includes(e.status))) ?? null);
  prismaMock.payment.findFirst.mockResolvedValue(null);
  prismaMock.payment.findMany.mockImplementation(async () => payments);
  prismaMock.paymentLateFeeAllocation.findMany.mockImplementation(async ({ where }) => fees.filter(a => where.scheduleId.in.includes(a.scheduleId)));
  prismaMock.paymentLateFeeAllocation.createMany.mockImplementation(async ({ data }) => { fees.push(...data); return { count: data.length }; });
  prismaMock.payment.create.mockImplementation(async ({ data }) => {
    const result = { id: `p${payments.length + 1}`, createdAt: new Date(), reversesPaymentId: null,
      reversalReason: null, ...data };
    for (const key of ["totalAmount", "capitalApplied", "interestApplied", "lateFeeApplied"]) result[key] = new Prisma.Decimal(result[key]);
    payments.push(result); return result;
  });
  prismaMock.payment.findUnique.mockImplementation(async ({ where }) => {
    const result = payments.find(p => p.id === where.id);
    return result ? { ...result, reversedBy: payments.find(p => p.reversesPaymentId === result.id) ?? null,
      lateFeeAllocations: fees.filter(a => a.paymentId === result.id) } : null;
  });
  prismaMock.auditLog.create.mockResolvedValue({ id: "audit" });
  return { loan, entries, payments, fees };
}
