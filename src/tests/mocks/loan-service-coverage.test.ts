import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup";
import {
  getLoanAmortization,
  getOverdueLoans,
  processOverdueLoans,
} from "../../../lib/services/loan.service";
import { LoanNotFoundError } from "../../../lib/errors";
import { LoanStatus, ScheduleStatus } from "@prisma/client";
import { prismaMock } from "./prisma.mock";
import { createMockFlatRateLoan, createMockSchedule } from "./test-factories";

// ============================================
// getLoanAmortization
// ============================================

describe("getLoanAmortization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza LoanNotFoundError si el préstamo no existe", async () => {
    prismaMock.loan.findUnique.mockResolvedValue(null);

    await expect(getLoanAmortization("non-existent")).rejects.toThrow(LoanNotFoundError);
  });

  it("retorna las cuotas del schedule desde DB", async () => {
    const flatLoan = createMockFlatRateLoan();
    const schedule = createMockSchedule("loan-flat-1", 45, 300);

    prismaMock.loan.findUnique
      .mockResolvedValueOnce(flatLoan)  // getLoanAmortization
      .mockResolvedValueOnce(flatLoan); // getLoanSchedule
    prismaMock.paymentSchedule.findMany.mockResolvedValue(schedule);

    const result = await getLoanAmortization("loan-flat-1");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(45);
    expect(prismaMock.paymentSchedule.findMany).toHaveBeenCalledOnce();
  });
});

// ============================================
// getOverdueLoans
// ============================================

describe("getOverdueLoans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna préstamos ACTIVE con nextDueDate anterior a hoy", async () => {
    const overdueLoans = [
      {
        ...createMockFlatRateLoan(),
        id: "loan-overdue-1",
        status: LoanStatus.ACTIVE,
        nextDueDate: new Date(Date.now() - 5 * 86400000),
        client: { id: "client-1", firstName: "Juan", lastName: "Pérez", documentId: "001", phone: "809" },
      },
    ];
    prismaMock.loan.findMany.mockResolvedValue(overdueLoans);

    const result = await getOverdueLoans();

    expect(prismaMock.loan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: LoanStatus.ACTIVE }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("loan-overdue-1");
  });

  it("retorna array vacío si no hay préstamos vencidos", async () => {
    prismaMock.loan.findMany.mockResolvedValue([]);

    const result = await getOverdueLoans();

    expect(result).toHaveLength(0);
  });
});

// ============================================
// processOverdueLoans
// ============================================

describe("processOverdueLoans", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async callback => callback(prismaMock));
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit" });
  });
  it("locks each loan before marking its installments and state", async () => {
    prismaMock.loan.findMany.mockResolvedValue([{ id: "loan-1" }]);
    prismaMock.loan.findUnique.mockResolvedValue(createMockFlatRateLoan({ id: "loan-1" }));
    prismaMock.paymentSchedule.updateMany.mockResolvedValue({ count: 2 });
    expect(await processOverdueLoans("user-1")).toEqual({ affected: 1 });
    expect(prismaMock.paymentSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ loanId: "loan-1", status: "PENDING" }) }));
    expect(prismaMock.loan.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "OVERDUE", updatedById: "user-1" } }));
    expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prismaMock.paymentSchedule.updateMany.mock.invocationCallOrder[0]);
  });
  it("returns zero for an empty batch", async () => {
    prismaMock.loan.findMany.mockResolvedValue([]);
    expect(await processOverdueLoans("user-1")).toEqual({ affected: 0 });
  });
  it("revalidates canceled loans after locking", async () => {
    prismaMock.loan.findMany.mockResolvedValue([{ id: "loan-1" }]);
    prismaMock.loan.findUnique.mockResolvedValue(createMockFlatRateLoan({ status: "CANCELED" }));
    expect(await processOverdueLoans("user-1")).toEqual({ affected: 0 });
    expect(prismaMock.paymentSchedule.updateMany).not.toHaveBeenCalled();
  });
  it("does not mark a loan whose pending installments were paid while waiting", async () => {
    prismaMock.loan.findMany.mockResolvedValue([{ id: "loan-1" }]);
    prismaMock.loan.findUnique.mockResolvedValue(createMockFlatRateLoan());
    prismaMock.paymentSchedule.updateMany.mockResolvedValue({ count: 0 });
    expect(await processOverdueLoans("user-1")).toEqual({ affected: 0 });
    expect(prismaMock.loan.update).not.toHaveBeenCalled();
  });
});
