import { prisma } from "../db/prisma";
import { LoanStatus, PaymentType, ScheduleStatus, Prisma } from "@prisma/client";
import {
  PaymentNotFoundError,
  PaymentExceedsBalanceError,
  LoanNotFoundError,
  PaymentNotAllowedError,
  InvalidPaymentAmountError,
  CannotReversePaymentError,
} from "../errors";
import {
  calculateFlatRatePaymentDistribution,
  calculateFlatRateLateFee,
} from "../domain/flatRateCalculator";
import { PaginationOptions, PaginatedResult } from "../types";
import { auditLog, AuditAction, AuditEntity } from "./audit.service";
import { withPaymentIdempotency } from "./payment-idempotency";

// ============================================
// INTERFACES
// ============================================

export interface CreatePaymentInput {
  loanId: string;
  totalAmount: number;
  type: PaymentType;
  createdById: string;
  paymentDate?: Date;
  idempotencyKey?: string;
}

export interface PaymentDistribution {
  capitalApplied: number;
  interestApplied: number;
  lateFeeApplied: number;
  totalAmount: number;
  installmentsCovered: number;
  isFullSettlement: boolean;
  excessAmount: number;
}

export interface PaymentFilters {
  loanId?: string;
  type?: PaymentType;
  createdById?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaymentResult {
  payment: Awaited<ReturnType<typeof prisma.payment.create>>;
  loan: Awaited<ReturnType<typeof prisma.loan.update>>;
  previousBalance: number;
  newBalance: number;
  statusChanged: boolean;
  installmentsCovered?: number;
  installmentsPaid?: number;
  installmentsPending?: number;
  excessAmount?: number;
}

// ============================================
// DISTRIBUCIÓN DE PAGO — FLAT RATE
// ============================================

/**
 * Calcula cómo se distribuye un pago en un préstamo Flat Rate.
 *
 * REGLAS (Opción B — cargo sagrado):
 * - El pago cubre cuotas completas en orden cronológico
 * - Si hay mora, se descuenta primero
 * - Excedente va a cuotas futuras (adelantadas)
 * - NO se permiten cuotas parciales
 */
export async function calculateFlatRateDistribution(
  loanId: string,
  paymentAmount: number,
  paymentDate: Date = new Date(),
  db: Prisma.TransactionClient = prisma
): Promise<PaymentDistribution & { scheduleEntriesToMark: string[] }> {
  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);

  const pendingEntries = await db.paymentSchedule.findMany({
    where: {
      loanId,
      status: { in: [ScheduleStatus.PENDING, ScheduleStatus.OVERDUE] },
    },
    orderBy: { installmentNumber: "asc" },
  });

  if (pendingEntries.length === 0) {
    throw new Error("Este préstamo no tiene cuotas pendientes");
  }

  const installmentAmount = Number(loan.installmentAmount);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueEntries = pendingEntries.filter(
    (e) => new Date(e.dueDate) < today
  );
  const lateFee = calculateFlatRateLateFee(overdueEntries.length, installmentAmount);

  const dist = calculateFlatRatePaymentDistribution({
    paymentAmount,
    installmentAmount,
    pendingInstallments: pendingEntries.length,
    overdueInstallments: overdueEntries.length,
    installmentAmount_lateFee: lateFee,
  });

  const entriesToMark = dist.isFullSettlement
    ? pendingEntries.map((e) => e.id)
    : pendingEntries.slice(0, dist.installmentsCovered).map((e) => e.id);

  const principalPerInstallment = Number(loan.principalAmount) / loan.termCount;
  const interestPerInstallment  = Number(loan.totalFinanceCharge) / loan.termCount;

  const capitalApplied  = Math.round(principalPerInstallment * dist.installmentsCovered * 100) / 100;
  const interestApplied = Math.round(interestPerInstallment  * dist.installmentsCovered * 100) / 100;

  return {
    capitalApplied,
    interestApplied,
    lateFeeApplied: dist.lateFeeApplied,
    totalAmount: paymentAmount,
    installmentsCovered: dist.installmentsCovered,
    isFullSettlement: dist.isFullSettlement,
    excessAmount: dist.excessAmount,
    scheduleEntriesToMark: entriesToMark,
  };
}

// ============================================
// CREATE PAYMENT
// ============================================

/**
 * Registra un pago usando lógica Flat Rate.
 */
export async function createPayment(data: CreatePaymentInput): Promise<PaymentResult> {
  if (data.idempotencyKey) {
    return withPaymentIdempotency(data, data.idempotencyKey, (tx) => createPaymentCore(data, tx));
  }
  return createPaymentCore(data);
}

async function createPaymentCore(data: CreatePaymentInput, db: Prisma.TransactionClient = prisma): Promise<PaymentResult> {
  if (!Number.isFinite(data.totalAmount) || data.totalAmount <= 0) {
    throw new InvalidPaymentAmountError("El monto del pago debe ser mayor a cero");
  }

  const loan = await db.loan.findUnique({ where: { id: data.loanId } });
  if (!loan) throw new LoanNotFoundError(data.loanId);

  if (loan.status === LoanStatus.PAID) throw new PaymentNotAllowedError(data.loanId, loan.status);
  if (loan.status === LoanStatus.CANCELED) throw new PaymentNotAllowedError(data.loanId, loan.status);

  const dist = await calculateFlatRateDistribution(
    data.loanId,
    data.totalAmount,
    data.paymentDate ?? new Date(), db
  );

  if (dist.installmentsCovered === 0 && !dist.isFullSettlement) {
    throw new InvalidPaymentAmountError(
      `El monto RD$${data.totalAmount} es insuficiente para cubrir una cuota de RD$${Number(loan.installmentAmount)}`
    );
  }

  const operation = async (tx: Prisma.TransactionClient) => {
    const paymentType = dist.isFullSettlement
      ? PaymentType.FULL_SETTLEMENT
      : dist.installmentsCovered > 1
      ? PaymentType.ADVANCE
      : PaymentType.REGULAR;

    const payment = await tx.payment.create({
      data: {
        loanId: data.loanId,
        totalAmount: data.totalAmount,
        capitalApplied: dist.capitalApplied,
        interestApplied: dist.interestApplied,
        lateFeeApplied: dist.lateFeeApplied,
        installmentsCovered: dist.installmentsCovered,
        type: paymentType,
        createdById: data.createdById,
        paymentDate: data.paymentDate ?? new Date(),
      },
    });

    if (dist.scheduleEntriesToMark.length > 0) {
      await tx.paymentSchedule.updateMany({
        where: { id: { in: dist.scheduleEntriesToMark } },
        data: {
          status: ScheduleStatus.PAID,
          paidAt: data.paymentDate ?? new Date(),
          paymentId: payment.id,
        },
      });
    }

    const newInstallmentsPaid = (loan.installmentsPaid ?? 0) + dist.installmentsCovered;
    const newRemainingCapital = Math.max(
      0,
      Number(loan.totalPayableAmount) - newInstallmentsPaid * Number(loan.installmentAmount)
    );
    const newStatus = newInstallmentsPaid >= loan.termCount ? LoanStatus.PAID : LoanStatus.ACTIVE;

    const nextPendingEntry = await tx.paymentSchedule.findFirst({
      where: {
        loanId: data.loanId,
        status: ScheduleStatus.PENDING,
        id: { notIn: dist.scheduleEntriesToMark },
      },
      orderBy: { installmentNumber: "asc" },
    });

    const updatedLoan = await tx.loan.update({
      where: { id: data.loanId },
      data: {
        installmentsPaid: newInstallmentsPaid,
        remainingCapital: newRemainingCapital,
        status: newStatus,
        nextDueDate: newStatus === LoanStatus.PAID ? null : nextPendingEntry?.dueDate ?? null,
        updatedById: data.createdById,
      },
      include: { client: true },
    });

    return {
      payment,
      loan: updatedLoan,
      previousBalance: Number(loan.remainingCapital),
      newBalance: newRemainingCapital,
      statusChanged: loan.status !== newStatus,
      installmentsCovered: dist.installmentsCovered,
      installmentsPaid: newInstallmentsPaid,
      installmentsPending: loan.termCount - newInstallmentsPaid,
      excessAmount: dist.excessAmount,
    };
  };
  const result = db === prisma ? await prisma.$transaction(operation) : await operation(db);

  const auditDetails = {
    loanStructure: "FLAT_RATE",
    totalAmount: data.totalAmount,
    loanId: data.loanId,
    installmentsCovered: dist.installmentsCovered,
    isFullSettlement: dist.isFullSettlement,
    excessAmount: dist.excessAmount,
    installmentsPaid: result.installmentsPaid,
    installmentsPending: result.installmentsPending,
  };
  if (db === prisma) {
    await auditLog(data.createdById, AuditAction.REGISTER_PAYMENT, AuditEntity.PAYMENT, result.payment.id, auditDetails);
  } else {
    await db.auditLog.create({ data: { userId: data.createdById, action: AuditAction.REGISTER_PAYMENT, entity: AuditEntity.PAYMENT, entityId: result.payment.id, details: auditDetails } });
  }

  return result;
}

// ============================================
// REVERSIÓN DE PAGO
// ============================================

export async function reversePayment(
  paymentId: string,
  reversedById: string,
  reason: string
): Promise<PaymentResult> {
  const result = await prisma.$transaction(async (tx) => {
    const originalPayment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { loan: true },
    });

    if (!originalPayment) throw new PaymentNotFoundError(paymentId);
    if (originalPayment.loan.status === LoanStatus.CANCELED) {
      throw new CannotReversePaymentError(paymentId, "El préstamo está cancelado");
    }

    const currentBalance = Number(originalPayment.loan.remainingCapital);
    const newBalance = currentBalance + Number(originalPayment.totalAmount);

    const reversalPayment = await tx.payment.create({
      data: {
        loanId: originalPayment.loanId,
        totalAmount: -Number(originalPayment.totalAmount),
        capitalApplied: -Number(originalPayment.capitalApplied),
        interestApplied: -Number(originalPayment.interestApplied),
        lateFeeApplied: -Number(originalPayment.lateFeeApplied),
        installmentsCovered: -(originalPayment.installmentsCovered ?? 1),
        type: originalPayment.type,
        createdById: reversedById,
        paymentDate: new Date(),
      },
    });

    // Revertir cuotas del schedule
    await tx.paymentSchedule.updateMany({
      where: { paymentId: paymentId },
      data: {
        status: ScheduleStatus.PENDING,
        paidAt: null,
        paymentId: null,
      },
    });

    const installmentsCovered = originalPayment.installmentsCovered ?? 1;
    const newInstallmentsPaid = Math.max(
      0,
      (originalPayment.loan.installmentsPaid ?? 0) - installmentsCovered
    );

    const nextPending = await tx.paymentSchedule.findFirst({
      where: { loanId: originalPayment.loanId, status: ScheduleStatus.PENDING },
      orderBy: { installmentNumber: "asc" },
    });

    const newStatus =
      originalPayment.loan.status === LoanStatus.PAID ? LoanStatus.ACTIVE : originalPayment.loan.status;

    const updatedLoan = await tx.loan.update({
      where: { id: originalPayment.loanId },
      data: {
        installmentsPaid: newInstallmentsPaid,
        remainingCapital: newBalance,
        status: newStatus,
        nextDueDate: nextPending?.dueDate ?? null,
        updatedById: reversedById,
      },
      include: { client: true },
    });

    return {
      payment: reversalPayment,
      loan: updatedLoan,
      previousBalance: currentBalance,
      newBalance,
      statusChanged: originalPayment.loan.status !== newStatus,
      installmentsCovered: -installmentsCovered,
    };
  });

  await auditLog(reversedById, AuditAction.REVERSE_PAYMENT, AuditEntity.PAYMENT, result.payment.id, {
    originalPaymentId: paymentId,
    loanId: result.loan.id,
    reversedAmount: Number(result.payment.totalAmount),
    reason,
  });

  return result;
}

// ============================================
// QUERIES
// ============================================

export async function getPaymentById(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      loan: { include: { client: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!payment) throw new PaymentNotFoundError(paymentId);
  return payment;
}

export async function getPayments(
  filters?: PaymentFilters,
  pagination?: PaginationOptions
): Promise<PaginatedResult<Awaited<ReturnType<typeof prisma.payment.findMany>>[number]>> {
  const page  = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const skip  = (page - 1) * limit;
  const where: Prisma.PaymentWhereInput = {};

  if (filters?.loanId)      where.loanId = filters.loanId;
  if (filters?.type)        where.type = filters.type;
  if (filters?.createdById) where.createdById = filters.createdById;
  if (filters?.dateFrom || filters?.dateTo) {
    where.paymentDate = {};
    if (filters.dateFrom) where.paymentDate.gte = filters.dateFrom;
    if (filters.dateTo)   where.paymentDate.lte = filters.dateTo;
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      include: {
        loan: {
          select: {
            id: true,
            loanStructure: true,
            client: { select: { id: true, firstName: true, lastName: true, documentId: true } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { paymentDate: "desc" },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    data: payments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
}

export async function getPaymentsByLoan(loanId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);

  return prisma.payment.findMany({
    where: { loanId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { paymentDate: "desc" },
  });
}

export async function getPaymentsSummary(loanId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);

  const aggregation = await prisma.payment.aggregate({
    where: { loanId },
    _sum: { totalAmount: true, capitalApplied: true, interestApplied: true, lateFeeApplied: true },
    _count: true,
    _max: { paymentDate: true },
    _min: { paymentDate: true },
  });

  return {
    loanId,
    loanStructure: loan.loanStructure,
    totalPayments: aggregation._count,
    totalPaid: Number(aggregation._sum.totalAmount ?? 0),
    totalCapitalPaid: Number(aggregation._sum.capitalApplied ?? 0),
    totalInterestPaid: Number(aggregation._sum.interestApplied ?? 0),
    totalLateFeesPaid: Number(aggregation._sum.lateFeeApplied ?? 0),
    firstPaymentDate: aggregation._min.paymentDate,
    lastPaymentDate: aggregation._max.paymentDate,
    principalAmount: Number(loan.principalAmount),
    remainingCapital: Number(loan.remainingCapital),
    installmentsPaid: loan.installmentsPaid,
    installmentsPending: loan.termCount - (loan.installmentsPaid ?? 0),
    totalFinanceCharge: Number(loan.totalFinanceCharge),
    totalPayableAmount: Number(loan.totalPayableAmount),
    progressPercentage: ((loan.installmentsPaid ?? 0) / loan.termCount) * 100,
  };
}

export async function getTodayPayments() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return prisma.payment.findMany({
    where: { paymentDate: { gte: today, lt: tomorrow } },
    include: {
      loan: {
        include: {
          client: { select: { id: true, firstName: true, lastName: true, documentId: true } },
        },
      },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { paymentDate: "desc" },
  });
}
