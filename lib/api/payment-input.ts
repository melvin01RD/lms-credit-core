import { PaymentType, Prisma } from "@prisma/client";
import { ServiceError } from "../errors";
import type { CreatePaymentInput } from "../services/payment.service";

/** Shared HTTP contract; actor and nested-route loan identity are server-owned. */
export async function readPaymentInput(
  request: Request,
  userId: string,
  routeLoanId?: string,
): Promise<CreatePaymentInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ServiceError("El cuerpo debe ser JSON válido", "INVALID_JSON", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ServiceError("Se requiere un objeto JSON", "INVALID_BODY", 400);
  }
  const data = body as Record<string, unknown>;
  const loanId = routeLoanId ?? data.loanId;
  if (typeof loanId !== "string" || !loanId.trim()) {
    throw new ServiceError("loanId es requerido", "MISSING_LOAN_ID", 400);
  }
  if (routeLoanId && data.loanId !== undefined && data.loanId !== routeLoanId) {
    throw new ServiceError("El préstamo del cuerpo no coincide con la ruta", "LOAN_ID_MISMATCH", 400);
  }
  const amount = data.totalAmount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
      amount > 9999999999.99 || new Prisma.Decimal(amount).decimalPlaces() > 2) {
    throw new ServiceError("Monto inválido: use un número positivo con hasta dos decimales", "INVALID_AMOUNT", 400);
  }
  const type = data.type ?? PaymentType.REGULAR;
  if (!Object.values(PaymentType).includes(type as PaymentType)) {
    throw new ServiceError("Tipo de pago inválido", "INVALID_PAYMENT_TYPE", 400);
  }
  let paymentDate: Date | undefined;
  if (data.paymentDate !== undefined) {
    const value = data.paymentDate;
    // Accept a calendar date or an ISO timestamp with an explicit timezone.
    if (typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
      throw new ServiceError("Fecha de pago inválida", "INVALID_PAYMENT_DATE", 400);
    }
    const calendar = new Date(value.slice(0, 10));
    paymentDate = new Date(value);
    if (!Number.isFinite(paymentDate.getTime()) || !Number.isFinite(calendar.getTime()) ||
        calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) {
      throw new ServiceError("Fecha de pago inválida", "INVALID_PAYMENT_DATE", 400);
    }
  }
  return { loanId, totalAmount: amount, type: type as PaymentType, paymentDate, createdById: userId };
}
