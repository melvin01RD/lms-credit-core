import { prisma } from "../db/prisma";
import { PaymentType, Prisma } from "@prisma/client";
import {
  PaymentNotFoundError,
  LoanNotFoundError,
} from "../errors";
import { PaginationOptions, PaginatedResult } from "../types";

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

export { createPayment, reversePayment, calculateFlatRateDistribution } from "./payment-processing";

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
