import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { LoanStatus, LoanStructure, PaymentFrequency, ScheduleStatus, Prisma } from "@prisma/client";
import {
  LoanNotFoundError,
  PaymentNotAllowedError,
  ServiceError,
  TokenNotFoundError,
  TokenExpiredError,
  TokenAlreadyUsedError,
} from "../errors";
import {
  calculateFlatRateLoan,
  FlatRateLoanInput,
  FlatRateLoanResult,
} from "../domain/flatRateCalculator";
import { PaginationOptions, PaginatedResult } from "../types";
import { auditLog, AuditAction, AuditEntity } from "./audit.service";

// ============================================
// INTERFACES
// ============================================

export interface CreateLoanInput {
  clientId: string;
  principalAmount: number;
  totalFinanceCharge: number;   // cargo fijo acordado
  paymentFrequency: PaymentFrequency;
  termCount: number;
  createdById: string;
  guarantees?: string;
  status?: 'DRAFT';             // si se pasa 'DRAFT', el préstamo no genera schedule
  // loanStructure es ignorado — siempre FLAT_RATE
  loanStructure?: string;
}

export interface LoanFilters {
  clientId?: string;
  status?: LoanStatus | LoanStatus[];
  loanStructure?: LoanStructure;
  createdById?: string;
  search?: string;
}

// ============================================
// HELPERS INTERNOS
// ============================================

/**
 * Persiste el PaymentSchedule en DB dentro de la transacción de creación del loan.
 */
async function createPaymentScheduleInTx(
  tx: Prisma.TransactionClient,
  loanId: string,
  schedule: Array<{
    installmentNumber: number;
    dueDate: Date;
    expectedAmount: number;
    principalExpected: number;
    interestExpected: number;
  }>
) {
  await tx.paymentSchedule.createMany({
    data: schedule.map((entry) => ({
      loanId,
      installmentNumber: entry.installmentNumber,
      dueDate: entry.dueDate,
      expectedAmount: entry.expectedAmount,
      principalExpected: entry.principalExpected,
      interestExpected: entry.interestExpected,
      status: ScheduleStatus.PENDING,
    })),
  });
}

// ============================================
// LOAN OPERATIONS
// ============================================

/**
 * Crea un préstamo nuevo con estructura Flat Rate.
 * El cargo financiero es fijo desde el día 1.
 */
export async function createLoan(data: CreateLoanInput) {
  const isDraft = data.status === 'DRAFT';

  const calc = calculateFlatRateLoan({
    principalAmount: data.principalAmount,
    totalFinanceCharge: data.totalFinanceCharge,
    termCount: data.termCount,
    paymentFrequency: data.paymentFrequency,
    startDate: new Date(),
  });

  // Los borradores no tienen fecha de vencimiento ni schedule activo
  const nextDueDate = isDraft ? null : (calc.schedule[0]?.dueDate ?? null);

  const loan = await prisma.$transaction(async (tx) => {
    const newLoan = await tx.loan.create({
      data: {
        clientId: data.clientId,
        loanStructure: LoanStructure.FLAT_RATE,
        principalAmount: data.principalAmount,
        annualInterestRate: null,
        totalFinanceCharge: data.totalFinanceCharge,
        totalPayableAmount: calc.totalPayableAmount,
        paymentFrequency: data.paymentFrequency,
        termCount: data.termCount,
        installmentAmount: calc.installmentAmount,
        remainingCapital: calc.totalPayableAmount,
        installmentsPaid: 0,
        nextDueDate,
        status: isDraft ? LoanStatus.DRAFT : LoanStatus.ACTIVE,
        guarantees: data.guarantees,
        createdById: data.createdById,
      },
      include: {
        client: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Solo los préstamos ACTIVE generan PaymentSchedule
    if (!isDraft) {
      await createPaymentScheduleInTx(tx, newLoan.id, calc.schedule);
    }

    return newLoan;
  });

  await auditLog(data.createdById, AuditAction.CREATE_LOAN, AuditEntity.LOAN, loan.id, {
    loanStructure: "FLAT_RATE",
    status: isDraft ? "DRAFT" : "ACTIVE",
    clientId: data.clientId,
    principalAmount: data.principalAmount,
    totalFinanceCharge: data.totalFinanceCharge,
    totalPayableAmount: calc.totalPayableAmount,
    installmentAmount: calc.installmentAmount,
    paymentFrequency: data.paymentFrequency,
    termCount: data.termCount,
  });

  return loan;
}

/**
 * Activa un préstamo DRAFT: genera el PaymentSchedule y lo pasa a ACTIVE.
 * Solo puede ser llamado por un ADMIN.
 */
export async function activateLoan(loanId: string, userId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);
  if (loan.status !== LoanStatus.DRAFT) {
    throw new Error(`Solo préstamos en borrador pueden activarse. Estado actual: ${loan.status}`);
  }

  const calc = calculateFlatRateLoan({
    principalAmount: Number(loan.principalAmount),
    totalFinanceCharge: Number(loan.totalFinanceCharge ?? 0),
    termCount: loan.termCount,
    paymentFrequency: loan.paymentFrequency,
    startDate: new Date(),
  });

  const nextDueDate = calc.schedule[0]?.dueDate ?? null;

  const activatedLoan = await prisma.$transaction(async (tx) => {
    const updated = await tx.loan.update({
      where: { id: loanId },
      data: {
        status: LoanStatus.ACTIVE,
        nextDueDate,
        updatedById: userId,
      },
      include: {
        client: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await createPaymentScheduleInTx(tx, loanId, calc.schedule);

    return updated;
  });

  await auditLog(userId, AuditAction.ACTIVATE_LOAN, AuditEntity.LOAN, loanId, {
    previousStatus: "DRAFT",
    nextDueDate,
    installmentAmount: calc.installmentAmount,
    termCount: loan.termCount,
  });

  return activatedLoan;
}

/**
 * Elimina permanentemente un préstamo en estado DRAFT.
 * No puede eliminar préstamos en otros estados.
 */
export async function deleteDraftLoan(loanId: string, userId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);
  if (loan.status !== LoanStatus.DRAFT) {
    throw new Error(`Solo borradores pueden eliminarse. Estado actual: ${loan.status}`);
  }

  await auditLog(userId, AuditAction.DELETE_DRAFT_LOAN, AuditEntity.LOAN, loanId, {
    clientId: loan.clientId,
    principalAmount: Number(loan.principalAmount),
    createdAt: loan.createdAt,
  });

  await prisma.loan.delete({ where: { id: loanId } });
}

/**
 * Genera un token único de aprobación para un préstamo en DRAFT.
 * El token expira en 24 horas. Solo ADMIN y OPERATOR pueden llamarlo.
 */
export async function generateApprovalToken(loanId: string, userId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);
  if (loan.status !== LoanStatus.DRAFT) {
    throw new ServiceError(
      `Solo préstamos en borrador pueden generar un token de aprobación. Estado actual: ${loan.status}`,
      "LOAN_NOT_IN_DRAFT",
      400
    );
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  await prisma.loan.update({
    where: { id: loanId },
    data: { approvalToken: token, approvalTokenExp: expiresAt },
  });

  await auditLog(userId, AuditAction.GENERATE_APPROVAL_TOKEN, AuditEntity.LOAN, loanId, {
    expiresAt: expiresAt.toISOString(),
  });

  return { token, expiresAt };
}

/**
 * Activa un préstamo vía token público firmado por el cliente.
 * Genera el PaymentSchedule, invalida el token y registra la firma.
 */
export async function approveViaToken(token: string, clientSignature: string) {
  if (!clientSignature?.trim()) {
    throw new ServiceError("Debe ingresar su nombre completo para confirmar", "MISSING_SIGNATURE", 400);
  }

  const loan = await prisma.loan.findUnique({ where: { approvalToken: token } });
  if (!loan) throw new TokenNotFoundError();

  if (!loan.approvalTokenExp || loan.approvalTokenExp < new Date()) {
    throw new TokenExpiredError();
  }
  if (loan.status !== LoanStatus.DRAFT) {
    throw new TokenAlreadyUsedError();
  }

  const calc = calculateFlatRateLoan({
    principalAmount: Number(loan.principalAmount),
    totalFinanceCharge: Number(loan.totalFinanceCharge ?? 0),
    termCount: loan.termCount,
    paymentFrequency: loan.paymentFrequency,
    startDate: new Date(),
  });

  const nextDueDate = calc.schedule[0]?.dueDate ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        status: LoanStatus.ACTIVE,
        nextDueDate,
        approvedAt: new Date(),
        approvedByName: clientSignature.trim(),
        approvalToken: null,
        approvalTokenExp: null,
      },
    });
    await createPaymentScheduleInTx(tx, loan.id, calc.schedule);
  });

  await auditLog(loan.createdById, AuditAction.ACTIVATE_LOAN, AuditEntity.LOAN, loan.id, {
    method: "CLIENT_APPROVAL_TOKEN",
    clientSignature: clientSignature.trim(),
    nextDueDate: nextDueDate?.toISOString() ?? null,
  });

  return {
    clientName: clientSignature.trim(),
    loanId: loan.id,
    nextDueDate: nextDueDate?.toISOString() ?? null,
  };
}

// ============================================
// SCHEDULE QUERIES
// ============================================

/**
 * Obtiene el plan de cuotas de un préstamo.
 */
export async function getLoanSchedule(loanId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);

  return prisma.paymentSchedule.findMany({
    where: { loanId },
    orderBy: { installmentNumber: "asc" },
  });
}

/**
 * Obtiene las cuotas pendientes de un préstamo.
 */
export async function getPendingScheduleEntries(loanId: string) {
  return prisma.paymentSchedule.findMany({
    where: {
      loanId,
      status: { in: [ScheduleStatus.PENDING, ScheduleStatus.OVERDUE] },
    },
    orderBy: { installmentNumber: "asc" },
  });
}

/**
 * Obtiene las cuotas vencidas (OVERDUE) de un préstamo.
 */
export async function getOverdueScheduleEntries(loanId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.paymentSchedule.findMany({
    where: {
      loanId,
      status: ScheduleStatus.PENDING,
      dueDate: { lt: today },
    },
    orderBy: { installmentNumber: "asc" },
  });
}

// ============================================
// QUERIES
// ============================================

export async function getLoanById(loanId: string) {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      client: true,
      payments: { orderBy: { paymentDate: "desc" } },
      paymentSchedule: { orderBy: { installmentNumber: "asc" } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!loan) throw new LoanNotFoundError(loanId);
  return loan;
}

export async function getLoans(
  filters?: LoanFilters,
  pagination?: PaginationOptions
): Promise<PaginatedResult<Awaited<ReturnType<typeof prisma.loan.findMany>>[number]>> {
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.LoanWhereInput = {};

  if (filters?.clientId)      where.clientId = filters.clientId;
  if (filters?.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }
  if (filters?.loanStructure) where.loanStructure = filters.loanStructure;
  if (filters?.createdById)   where.createdById = filters.createdById;

  if (filters?.search) {
    const searchTerm = filters.search.trim();
    where.client = {
      OR: [
        { firstName: { contains: searchTerm, mode: "insensitive" } },
        { lastName: { contains: searchTerm, mode: "insensitive" } },
        { documentId: { contains: searchTerm, mode: "insensitive" } },
      ],
    };
  }

  const [loans, total] = await Promise.all([
    prisma.loan.findMany({
      where,
      skip,
      take: limit,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, documentId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.loan.count({ where }),
  ]);

  return {
    data: loans,
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

export async function cancelLoan(loanId: string, userId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);
  if (loan.status === LoanStatus.PAID) throw new PaymentNotAllowedError(loanId, loan.status);
  if (loan.status === LoanStatus.CANCELED) throw new Error("El préstamo ya está cancelado");

  const canceledLoan = await prisma.loan.update({
    where: { id: loanId },
    data: { status: LoanStatus.CANCELED, updatedById: userId },
  });

  await auditLog(userId, AuditAction.CANCEL_LOAN, AuditEntity.LOAN, loanId, {
    previousStatus: loan.status,
    remainingCapital: Number(loan.remainingCapital),
  });

  return canceledLoan;
}

export async function markLoanAsOverdue(loanId: string, userId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);
  if (loan.status !== LoanStatus.ACTIVE) {
    throw new Error(`Solo préstamos ACTIVE pueden marcarse como OVERDUE. Estado actual: ${loan.status}`);
  }

  return prisma.loan.update({
    where: { id: loanId },
    data: { status: LoanStatus.OVERDUE, updatedById: userId },
  });
}

export async function getLoanPayments(loanId: string) {
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

export async function getLoanSummary(loanId: string) {
  const loan = await getLoanById(loanId);

  const payments = await prisma.payment.aggregate({
    where: { loanId },
    _sum: {
      totalAmount: true,
      capitalApplied: true,
      interestApplied: true,
      lateFeeApplied: true,
    },
    _count: true,
  });

  const principalAmount    = Number(loan.principalAmount);
  const remainingCapital   = Number(loan.remainingCapital);
  const totalPaid          = Number(payments._sum.totalAmount ?? 0);
  const capitalPaid        = Number(payments._sum.capitalApplied ?? 0);
  const interestPaid       = Number(payments._sum.interestApplied ?? 0);
  const lateFeesPaid       = Number(payments._sum.lateFeeApplied ?? 0);
  const totalPayableAmount = Number(loan.totalPayableAmount ?? principalAmount);

  const progressPercentage = (loan.installmentsPaid / loan.termCount) * 100;

  return {
    loan,
    summary: {
      principalAmount,
      remainingCapital,
      totalPayableAmount,
      capitalPaid,
      interestPaid,
      lateFeesPaid,
      totalPaid,
      paymentCount: payments._count,
      progressPercentage,
      installmentsPaid: loan.installmentsPaid,
      installmentsPending: loan.termCount - loan.installmentsPaid,
    },
  };
}

/**
 * Retorna el schedule de amortización mapeado al shape que espera el frontend.
 * Campos: totalPayment, principalPayment, interestPayment, remainingBalance.
 */
export async function getLoanAmortization(loanId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);

  const schedule = await prisma.paymentSchedule.findMany({
    where: { loanId },
    orderBy: { installmentNumber: 'asc' },
  });

  let remainingBalance = Number(loan.principalAmount);

  return schedule.map((entry) => {
    const principal = Number(entry.principalExpected);
    remainingBalance -= principal;
    return {
      installmentNumber: entry.installmentNumber,
      dueDate:           entry.dueDate,
      totalPayment:      Number(entry.expectedAmount),
      principalPayment:  principal,
      interestPayment:   Number(entry.interestExpected),
      remainingBalance,
    };
  });
}

export async function getOverdueLoans() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.loan.findMany({
    where: {
      status: LoanStatus.ACTIVE,
      nextDueDate: { lt: today },
    },
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, documentId: true, phone: true },
      },
    },
    orderBy: { nextDueDate: "asc" },
  });
}

export async function processOverdueLoans(userId: string): Promise<{ affected: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Marcar cuotas del schedule como OVERDUE
  await prisma.paymentSchedule.updateMany({
    where: {
      status: ScheduleStatus.PENDING,
      dueDate: { lt: today },
    },
    data: { status: ScheduleStatus.OVERDUE },
  });

  // Marcar los loans correspondientes (DRAFT excluido explícitamente)
  const result = await prisma.loan.updateMany({
    where: {
      status: LoanStatus.ACTIVE,
      nextDueDate: { lt: today },
    },
    data: {
      status: LoanStatus.OVERDUE,
      updatedById: userId,
    },
  });

  return { affected: result.count };
}
