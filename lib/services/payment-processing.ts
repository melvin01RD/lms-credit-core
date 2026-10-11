import { LoanStatus, PaymentType, Prisma, ScheduleStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import {
  CannotReversePaymentError, InvalidPaymentAmountError, LoanNotFoundError,
  PaymentExceedsBalanceError, PaymentNotAllowedError, PaymentNotFoundError, ServiceError
} from "../errors";
import { AuditAction, AuditEntity } from "./audit.service";
import { financialTransaction, lockLoan } from "./financial-transaction";
import { withPaymentIdempotency } from "./payment-idempotency";
import type { CreatePaymentInput, PaymentDistribution, PaymentResult } from "./payment.service";
import { isFinanciallyOverdue as isOverdue } from "../domain/financial-calendar";

const pending = [ScheduleStatus.PENDING, ScheduleStatus.OVERDUE];
const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const sum = (values: Prisma.Decimal.Value[]) => values.reduce<Prisma.Decimal>((a, b) => a.plus(b), money(0));

function validateAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 9999999999.99 || money(value).decimalPlaces() > 2) {
    throw new InvalidPaymentAmountError("El monto debe ser positivo y tener hasta dos decimales");
  }
}

export async function calculateFlatRateDistribution(
  loanId: string, paymentAmount: number, _paymentDate: Date = new Date(),
  db: Prisma.TransactionClient = prisma, now = new Date(),
): Promise<PaymentDistribution & { scheduleEntriesToMark: string[]; lateFeeAllocations: { scheduleId: string; amount: Prisma.Decimal }[] }> {
  validateAmount(paymentAmount);
  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);
  const entries = await db.paymentSchedule.findMany({
    where: { loanId, status: { in: pending } }, orderBy: { installmentNumber: "asc" },
  });
  if (!entries.length) throw new InvalidPaymentAmountError("Este préstamo no tiene cuotas pendientes");
  // Legacy mora has no per-installment attribution: require explicit reconciliation.
  const legacyFee = await db.payment.findFirst({
    where: {
      loanId, lateFeeApplied: { gt: 0 },
      lateFeeAllocations: { none: {} }, reversedBy: null
    }
  });
  if (legacyFee) throw new ServiceError("La mora histórica requiere conciliación por cuota", "FINANCIAL_HISTORY_REVIEW_REQUIRED", 409);
  const allocations = await db.paymentLateFeeAllocation.findMany({ where: { scheduleId: { in: entries.map(e => e.id) } } });
  const fees = entries.map(e => {
    const paid = sum(allocations.filter(a => a.scheduleId === e.id).map(a => a.amount));
    // Preserve the existing fixed 5% of the nominal installment (including the rounded last one).
    const due = isOverdue(e.dueDate, now)
      ? money(loan.installmentAmount).mul("0.05").toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : money(0);
    if (paid.lt(0) || paid.gt(due)) throw new ServiceError("Mora por cuota inconsistente", "INVALID_PAYMENT_SCHEDULE", 409);
    return due.minus(paid);
  });
  const due = sum(entries.map((e, i) => money(e.expectedAmount).plus(fees[i])));
  const amount = money(paymentAmount);
  if (amount.gt(due)) throw new PaymentExceedsBalanceError(paymentAmount, due.toNumber());
  const late = sum(fees);
  let rest = amount.minus(late);
  let capital = money(0), interest = money(0);
  const ids: string[] = [];
  for (const entry of entries) {
    const cost = money(entry.expectedAmount);
    if (rest.lt(cost)) break;
    if (!money(entry.principalExpected).plus(entry.interestExpected).eq(entry.expectedAmount)) {
      throw new ServiceError("El calendario tiene un desglose inconsistente", "INVALID_PAYMENT_SCHEDULE", 409);
    }
    rest = rest.minus(cost);
    capital = capital.plus(entry.principalExpected);
    interest = interest.plus(entry.interestExpected);
    ids.push(entry.id);
  }
  if (!ids.length || !rest.isZero()) {
    throw new InvalidPaymentAmountError("El monto debe cubrir primero toda la mora pendiente y cuotas completas, sin sobrantes");
  }
  return {
    capitalApplied: capital.toNumber(), interestApplied: interest.toNumber(),
    lateFeeApplied: late.toNumber(), totalAmount: paymentAmount, installmentsCovered: ids.length,
    isFullSettlement: ids.length === entries.length, excessAmount: 0, scheduleEntriesToMark: ids,
    lateFeeAllocations: entries.flatMap((e, i) => fees[i].gt(0) ? [{ scheduleId: e.id, amount: fees[i] }] : [])
  };
}

async function validateSchedule(tx: Prisma.TransactionClient, loan: Awaited<ReturnType<typeof lockLoan>>) {
  const entries = await tx.paymentSchedule.findMany({ where: { loanId: loan.id }, orderBy: { installmentNumber: "asc" } });
  const remaining = entries.filter(e => pending.includes(e.status as typeof pending[number]));
  const paid = entries.filter(e => !pending.includes(e.status as typeof pending[number]));
  const payments = await tx.payment.findMany({ where: { loanId: loan.id },
    select: { totalAmount: true, capitalApplied: true, interestApplied: true, lateFeeApplied: true } });
  if (entries.length !== loan.termCount || loan.totalPayableAmount == null || loan.totalFinanceCharge == null ||
    entries.some((e, i) => e.installmentNumber !== i + 1 || money(e.expectedAmount).lte(0) ||
      money(e.principalExpected).lt(0) || money(e.interestExpected).lt(0) ||
        (pending.includes(e.status as typeof pending[number]) ? e.paymentId !== null : e.paymentId === null) ||
      !money(e.principalExpected).plus(e.interestExpected).eq(e.expectedAmount)) ||
      payments.some(p => !money(p.totalAmount).eq(money(p.capitalApplied).plus(p.interestApplied).plus(p.lateFeeApplied))) ||
      !sum(payments.map(p => p.capitalApplied)).eq(sum(paid.map(e => e.principalExpected))) ||
      !sum(payments.map(p => p.interestApplied)).eq(sum(paid.map(e => e.interestExpected))) ||
    !sum(entries.map(e => e.expectedAmount)).eq(loan.totalPayableAmount) ||
    !sum(entries.map(e => e.principalExpected)).eq(loan.principalAmount) ||
    !sum(entries.map(e => e.interestExpected)).eq(loan.totalFinanceCharge) ||
    !sum(remaining.map(e => e.expectedAmount)).eq(loan.remainingCapital) ||
    entries.length - remaining.length !== loan.installmentsPaid) {
    throw new ServiceError("Saldos o cronograma históricos inconsistentes; se requiere conciliación", "INVALID_PAYMENT_SCHEDULE", 409);
  }
}

async function refreshLoan(tx: Prisma.TransactionClient, loanId: string, userId: string, now: Date) {
  const entries = await tx.paymentSchedule.findMany({ where: { loanId }, orderBy: { installmentNumber: "asc" } });
  const remaining = entries.filter(e => pending.includes(e.status as typeof pending[number]));
  const paid = entries.filter(e => e.status === ScheduleStatus.PAID || e.status === ScheduleStatus.ADVANCE_PAID);
  return tx.loan.update({
    where: { id: loanId }, data: {
      remainingCapital: sum(remaining.map(e => e.expectedAmount)),
      installmentsPaid: paid.length,
      status: remaining.length === 0 ? LoanStatus.PAID : remaining.some(e => isOverdue(e.dueDate, now)) ? LoanStatus.OVERDUE : LoanStatus.ACTIVE,
      nextDueDate: remaining[0]?.dueDate ?? null, updatedById: userId,
    }, include: { client: true }
  });
}

export async function createPayment(data: CreatePaymentInput): Promise<PaymentResult> {
  validateAmount(data.totalAmount);
  if (data.paymentDate && !Number.isFinite(data.paymentDate.getTime())) {
    throw new ServiceError("Fecha de pago inválida", "INVALID_PAYMENT_DATE", 400);
  }
  if (!Object.values(PaymentType).includes(data.type)) {
    throw new ServiceError("Tipo de pago inválido", "INVALID_PAYMENT_TYPE", 400);
  }
  return financialTransaction(tx => withPaymentIdempotency(tx, data, async () => {
    const loan = await lockLoan(tx, data.loanId);
    if (loan.status !== LoanStatus.ACTIVE && loan.status !== LoanStatus.OVERDUE) {
      throw new PaymentNotAllowedError(loan.id, loan.status);
    }
    await validateSchedule(tx, loan);
    const now = new Date();
    const dist = await calculateFlatRateDistribution(loan.id, data.totalAmount, data.paymentDate, tx, now);
    const payment = await tx.payment.create({
      data: {
        loanId: loan.id, createdById: data.createdById, paymentDate: data.paymentDate ?? now,
        totalAmount: money(data.totalAmount), capitalApplied: money(dist.capitalApplied),
        interestApplied: money(dist.interestApplied), lateFeeApplied: money(dist.lateFeeApplied),
        installmentsCovered: dist.installmentsCovered,
        type: dist.isFullSettlement ? PaymentType.FULL_SETTLEMENT : dist.installmentsCovered > 1 ? PaymentType.ADVANCE : PaymentType.REGULAR,
      }
    });
    if (dist.lateFeeAllocations.length) await tx.paymentLateFeeAllocation.createMany({
      data: dist.lateFeeAllocations.map(a => ({ ...a, paymentId: payment.id })),
    });
    const marked = await tx.paymentSchedule.updateMany({
      where: { loanId: loan.id, id: { in: dist.scheduleEntriesToMark }, status: { in: pending } },
      data: { status: ScheduleStatus.PAID, paidAt: data.paymentDate ?? now, paymentId: payment.id },
    });
    if (marked.count !== dist.installmentsCovered) throw new ServiceError("El calendario cambió durante el pago", "PAYMENT_CONFLICT", 409);
    const updated = await refreshLoan(tx, loan.id, data.createdById, now);
    const result: PaymentResult = {
      payment, loan: updated, previousBalance: Number(loan.remainingCapital),
      newBalance: Number(updated.remainingCapital), statusChanged: loan.status !== updated.status,
      installmentsCovered: dist.installmentsCovered, installmentsPaid: updated.installmentsPaid,
      installmentsPending: loan.termCount - updated.installmentsPaid, excessAmount: 0
    };
    await tx.auditLog.create({
      data: {
        userId: data.createdById, action: AuditAction.REGISTER_PAYMENT,
        entity: AuditEntity.PAYMENT, entityId: payment.id, details: {
          loanId: loan.id, totalAmount: data.totalAmount,
          capitalApplied: dist.capitalApplied, interestApplied: dist.interestApplied, lateFeeApplied: dist.lateFeeApplied,
          previousBalance: result.previousBalance, newBalance: result.newBalance, installmentsCovered: dist.installmentsCovered
        }
      }
    });
    return result;
  }));
}

export async function reversePayment(paymentId: string, userId: string, reason: string): Promise<PaymentResult> {
  if (!reason.trim()) throw new CannotReversePaymentError(paymentId, "Debe indicar el motivo");
  return financialTransaction(async tx => {
    // The first read only locates the immutable loan id. Re-read state after locking.
    const reference = await tx.payment.findUnique({ where: { id: paymentId }, select: { loanId: true } });
    if (!reference) throw new PaymentNotFoundError(paymentId);
    const loan = await lockLoan(tx, reference.loanId);
    const original = await tx.payment.findUnique({ where: { id: paymentId }, include: { reversedBy: true, lateFeeAllocations: true } });
    if (!original) throw new PaymentNotFoundError(paymentId);
    if (loan.status === LoanStatus.CANCELED || original.reversesPaymentId || money(original.totalAmount).lte(0)) {
      throw new CannotReversePaymentError(paymentId, "Préstamo cancelado o registro de reversión");
    }
    if (original.reversedBy) throw new ServiceError("El pago ya fue reversado", "PAYMENT_ALREADY_REVERSED", 409);
    await validateSchedule(tx, loan);
    const now = new Date();
    const entries = await tx.paymentSchedule.findMany({ where: { loanId: loan.id, paymentId } });
    if (!entries.length || entries.length !== original.installmentsCovered ||
      !sum(entries.map(e => e.expectedAmount)).eq(money(original.capitalApplied).plus(original.interestApplied))) {
      throw new CannotReversePaymentError(paymentId, "El pago no coincide con las cuotas registradas");
    }
    // LIFO by applied installment order, independent of supplied/backdated paymentDate.
    // A later payment may rely on mora this payment already covered on its installments.
    const later = await tx.paymentSchedule.findFirst({
      where: {
        loanId: loan.id,
        installmentNumber: { gt: Math.max(...entries.map(e => e.installmentNumber)) },
        status: { in: [ScheduleStatus.PAID, ScheduleStatus.ADVANCE_PAID] }
      }
    });
    if (later) throw new CannotReversePaymentError(paymentId, "Debe revertir primero los pagos posteriores");
    if (!sum(original.lateFeeAllocations.map(a => a.amount)).eq(original.lateFeeApplied)) {
      throw new CannotReversePaymentError(paymentId, "La mora histórica requiere conciliación por cuota");
    }
    const reversal = await tx.payment.create({
      data: {
        loanId: loan.id, createdById: userId, paymentDate: now, type: original.type,
        totalAmount: money(original.totalAmount).negated(), capitalApplied: money(original.capitalApplied).negated(),
        interestApplied: money(original.interestApplied).negated(), lateFeeApplied: money(original.lateFeeApplied).negated(),
        installmentsCovered: -original.installmentsCovered, reversesPaymentId: paymentId, reversalReason: reason.trim(),
      }
    });
    if (original.lateFeeAllocations.length) await tx.paymentLateFeeAllocation.createMany({
      data: original.lateFeeAllocations.map(a => ({ paymentId: reversal.id, scheduleId: a.scheduleId, amount: a.amount.negated() })),
    });
    const restored = await tx.paymentSchedule.updateMany({
      where: { loanId: loan.id, paymentId },
      data: { status: ScheduleStatus.PENDING, paidAt: null, paymentId: null }
    });
    if (restored.count !== original.installmentsCovered) throw new ServiceError("El calendario cambió durante la reversión", "PAYMENT_CONFLICT", 409);
    await tx.paymentSchedule.updateMany({
      where: { id: { in: entries.filter(e => isOverdue(e.dueDate, now)).map(e => e.id) } },
      data: { status: ScheduleStatus.OVERDUE }
    });
    const updated = await refreshLoan(tx, loan.id, userId, now);
    const result = {
      payment: reversal, loan: updated, previousBalance: Number(loan.remainingCapital),
      newBalance: Number(updated.remainingCapital), statusChanged: loan.status !== updated.status,
      installmentsCovered: -original.installmentsCovered
    };
    await tx.auditLog.create({
      data: {
        userId, action: AuditAction.REVERSE_PAYMENT, entity: AuditEntity.PAYMENT,
        entityId: reversal.id, details: {
          originalPaymentId: paymentId, loanId: loan.id, reason: reason.trim(),
          previousBalance: result.previousBalance, newBalance: result.newBalance
        }
      }
    });
    return result;
  });
}
